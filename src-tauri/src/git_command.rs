use crate::{locale, process, terminal_log};
use std::path::Path;

pub(super) fn git(path: &Path, args: &[&str]) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&git_bytes(path, args)?).into_owned())
}

pub(super) fn git_bytes(path: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    run(path, args, None, &[])
}

pub(super) fn git_with_input(
    path: &Path,
    args: &[&str],
    input: &str,
    env: &[(&str, &str)],
) -> Result<String, String> {
    let bytes = run(path, args, Some(input), env)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn run(
    path: &Path,
    args: &[&str],
    input: Option<&str>,
    env: &[(&str, &str)],
) -> Result<Vec<u8>, String> {
    let log_id = terminal_log::begin(path, args);
    // Large immutable branch snapshots can exceed the OS argument-size limit.
    let mut arguments = args.to_vec();
    let mut revisions = Vec::new();
    if (args.first() == Some(&"log") || args.get(1) == Some(&"log")) && args.len() > 1000 {
        let boundary = arguments
            .iter()
            .position(|arg| *arg == "--")
            .unwrap_or(arguments.len());
        let mut index = 0;
        arguments.retain(|arg| {
            let is_revision = index < boundary
                && [40, 64].contains(&arg.len())
                && arg.bytes().all(|byte| byte.is_ascii_hexdigit());
            index += 1;
            if is_revision {
                revisions.push(*arg);
            }
            !is_revision
        });
        if !revisions.is_empty() {
            arguments.insert(2, "--stdin");
        }
    }
    let mut command = process::background("git");
    command
        .arg("-C")
        .arg(path)
        .args(&arguments)
        .envs(env.iter().copied())
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_COMMON_DIR")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true");
    let input = input
        .map(str::to_owned)
        .or_else(|| (!revisions.is_empty()).then(|| revisions.join("\n") + "\n"));
    let output = if let Some(input) = input {
        use std::io::Write;
        use std::process::Stdio;
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command.spawn().and_then(|mut child| {
            // Drain output while writing, including when Git exits before reading stdin.
            let writer = child
                .stdin
                .take()
                .map(|mut stdin| std::thread::spawn(move || stdin.write_all(input.as_bytes())));
            let output = child.wait_with_output();
            if let Some(writer) = writer {
                let written = writer
                    .join()
                    .map_err(|_| std::io::Error::other("Git stdin writer failed"))?;
                if output.as_ref().is_ok_and(|output| output.status.success()) {
                    written?;
                }
            }
            output
        })
    } else {
        command.output()
    }
    .map_err(|e| {
        let message = locale::format("error.start-git", &[("e", e.to_string())]);
        terminal_log::finish(path, log_id, message.clone(), false, None);
        message
    })?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    // Remote URLs can contain credentials. Keep their stdout out of the terminal log.
    let combined = if args.starts_with(&["remote", "get-url"]) || stdout.is_empty() {
        stderr.to_string()
    } else if stderr.is_empty() {
        stdout.to_string()
    } else {
        format!("{}\n{}", stdout.trim_end(), stderr)
    };
    terminal_log::finish(
        path,
        log_id,
        combined,
        output.status.success(),
        output.status.code(),
    );
    if !output.status.success()
        && !(args.contains(&"--no-index") && output.status.code() == Some(1))
    {
        return Err(locale::format(
            "error.git",
            &[(
                "p1",
                (String::from_utf8_lossy(&output.stderr).trim()).to_string(),
            )],
        ));
    }
    Ok(output.stdout)
}
