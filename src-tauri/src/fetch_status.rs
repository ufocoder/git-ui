use std::{path::Path, time::{SystemTime, UNIX_EPOCH}};

pub fn read(path: &Path) -> Option<u64> {
    std::fs::read_to_string(path.join(".git/git-ui-last-fetch"))
        .ok()?.trim().parse().ok()
}

pub fn record(path: &Path) {
    let Ok(now) = SystemTime::now().duration_since(UNIX_EPOCH) else { return; };
    if let Err(error) = std::fs::write(path.join(".git/git-ui-last-fetch"), now.as_millis().to_string()) {
        eprintln!("Could not save fetch timestamp: {error}");
    }
}
