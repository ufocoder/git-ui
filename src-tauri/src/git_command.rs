use crate::{locale, process, terminal_log};
use std::path::Path;

enum GitCommandError {
    Process(std::io::Error),
    Exit { code: Option<i32>, stderr: String },
}

impl GitCommandError {
    fn user_message(&self) -> String {
        match self {
            Self::Process(error) => locale::format("error.start-git", &[("e", error.to_string())]),
            Self::Exit { stderr, .. } if missing_lfs(stderr) => {
                locale::text("error.git-lfs-missing").into()
            }
            Self::Exit { stderr, .. } => {
                locale::format("error.git", &[("p1", stderr.trim().to_owned())])
            }
        }
    }
}

fn missing_lfs(stderr: &str) -> bool {
    stderr.lines().any(|line| {
        line.contains("git-lfs")
            && (line.contains("command not found")
                || line.contains("not a git command")
                || line.contains("not found in PATH")
                || line.contains("not recognized as an internal or external command"))
    })
}

pub(super) fn git(path: &Path, args: &[&str]) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&git_bytes(path, args)?).into_owned())
}

pub(super) fn git_bytes(path: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    run(path, args, None, &[]).map_err(|error| error.user_message())
}

pub(super) fn git_with_input(
    path: &Path,
    args: &[&str],
    input: &str,
    env: &[(&str, &str)],
) -> Result<String, String> {
    let bytes = run(path, args, Some(input), env).map_err(|error| error.user_message())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn run(
    path: &Path,
    args: &[&str],
    input: Option<&str>,
    env: &[(&str, &str)],
) -> Result<Vec<u8>, GitCommandError> {
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
    #[cfg(target_os = "macos")]
    {
        // Finder launches with a shorter PATH than a login shell.
        let inherited = std::env::var_os("PATH").unwrap_or_default();
        let mut paths: Vec<_> = std::env::split_paths(&inherited).collect();
        for directory in ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"] {
            let directory = std::path::PathBuf::from(directory);
            if !paths.contains(&directory) {
                paths.push(directory);
            }
        }
        if let Ok(path) = std::env::join_paths(paths) {
            command.env("PATH", path);
        }
    }
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
    .map_err(|error| {
        let error = GitCommandError::Process(error);
        terminal_log::finish(path, log_id, error.user_message(), false, None);
        error
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
    let status = output.status;
    let failure = (!status.success()
        && !(args.contains(&"--no-index") && status.code() == Some(1)))
    .then(|| GitCommandError::Exit {
        code: status.code(),
        stderr: stderr.into_owned(),
    });
    let exit_code = match &failure {
        Some(GitCommandError::Exit { code, .. }) => *code,
        _ => status.code(),
    };
    terminal_log::finish(path, log_id, combined, status.success(), exit_code);
    match failure {
        Some(error) => Err(error),
        None => Ok(output.stdout),
    }
}
