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
