use std::{
    ffi::OsStr,
    process::{Command, Stdio},
};

/// All background commands must use this constructor so Windows never creates
/// a console for each Git invocation. Output remains captured by the caller.
pub(crate) fn background(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    command.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn background_process_has_no_console_and_captures_output() {
        let output = super::background("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", r#"
                Add-Type 'using System; using System.Runtime.InteropServices; public class ConsoleProbe { [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); }';
                if ([ConsoleProbe]::GetConsoleWindow() -ne [IntPtr]::Zero) { exit 7 };
                [Console]::Out.Write('captured');
                [Console]::Error.Write('diagnostic');
            "#])
            .output().expect("background process starts");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(String::from_utf8_lossy(&output.stdout), "captured");
        assert_eq!(String::from_utf8_lossy(&output.stderr), "diagnostic");
    }
}

/// Capture both output streams while allowing read-only background work to stop.
/// Draining on separate threads prevents Git from blocking on a full pipe.
pub(crate) fn output_cancellable(
    command: &mut Command,
    input: Option<String>,
    cancelled: &std::sync::atomic::AtomicBool,
) -> std::io::Result<std::process::Output> {
    use std::{
        io::{Read, Write},
        sync::atomic::Ordering,
        time::Duration,
    };
    let interrupted = || std::io::Error::new(std::io::ErrorKind::Interrupted, "cancelled");
    if cancelled.load(Ordering::Relaxed) {
        return Err(interrupted());
    }
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    if input.is_some() {
        command.stdin(Stdio::piped());
    }
    let mut child = command.spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let read = |mut stream: Box<dyn Read + Send>| {
        std::thread::spawn(move || {
            let mut data = Vec::new();
            stream.read_to_end(&mut data).map(|_| data)
        })
    };
    let out = read(Box::new(stdout));
    let err = read(Box::new(stderr));
    let writer = input.and_then(|input| {
        child
            .stdin
            .take()
            .map(|mut stdin| std::thread::spawn(move || stdin.write_all(input.as_bytes())))
    });
    let status = loop {
        if cancelled.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            break Err(interrupted());
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error);
            }
        }
    };
    let join_error = || std::io::Error::other("Git output reader failed");
    let stdout = out.join().map_err(|_| join_error()).and_then(|value| value);
    let stderr = err.join().map_err(|_| join_error()).and_then(|value| value);
    let written = writer.map(|writer| {
        writer
            .join()
            .map_err(|_| join_error())
            .and_then(|value| value)
    });
    let status = status?;
    if status.success() {
        if let Some(result) = written {
            result?;
        }
    }
    Ok(std::process::Output {
        status,
        stdout: stdout?,
        stderr: stderr?,
    })
}

#[cfg(test)]
mod cancellable_tests {
    use super::*;
    use std::{
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
        time::{Duration, Instant},
    };
    #[test]
    fn child_fixture() {
        let Ok(mode) = std::env::var("GIT_UI_PROCESS_TEST_CHILD") else {
            return;
        };
        use std::io::Write;
        std::io::stdout()
            .write_all(&vec![b'x'; 256 * 1024])
            .unwrap();
        std::io::stderr()
            .write_all(&vec![b'y'; 256 * 1024])
            .unwrap();
        if mode == "wait" {
            std::thread::sleep(Duration::from_secs(30));
        }
    }
    fn child(mode: &str) -> Command {
        let mut command = background(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "process::cancellable_tests::child_fixture",
                "--nocapture",
            ])
            .env("GIT_UI_PROCESS_TEST_CHILD", mode);
        command
    }
    #[test]
    fn captures_output_larger_than_both_pipe_buffers_without_deadlock() {
        let output =
            output_cancellable(&mut child("output"), None, &AtomicBool::new(false)).unwrap();
        assert!(output.status.success());
        assert!(output.stdout.len() >= 256 * 1024);
        assert!(output.stderr.len() >= 256 * 1024);
    }
    #[test]
    fn cancellation_kills_and_reaps_a_running_child() {
        let flag = Arc::new(AtomicBool::new(false));
        let cancel = flag.clone();
        let timer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            cancel.store(true, Ordering::Relaxed);
        });
        let start = Instant::now();
        let result = output_cancellable(&mut child("wait"), None, &flag);
        timer.join().unwrap();
        assert_eq!(result.unwrap_err().kind(), std::io::ErrorKind::Interrupted);
        assert!(start.elapsed() < Duration::from_secs(3));
    }
}
