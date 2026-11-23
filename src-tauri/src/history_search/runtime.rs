use crate::git_command::SEARCH_CANCELLED;
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        Arc, LazyLock, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

#[derive(Clone, Default)]
pub(super) struct Cancellation(pub Arc<AtomicBool>);
impl Cancellation {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::Relaxed);
    }
    pub fn check(&self) -> Result<(), String> {
        if self.0.load(Ordering::Relaxed) {
            Err(SEARCH_CANCELLED.into())
        } else {
            Ok(())
        }
    }
}
struct Active {
    id: String,
    cancellation: Cancellation,
}
static ACTIVE: LazyLock<Mutex<HashMap<String, Active>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
// IPC cancellation can arrive before an async command gets its first poll.
static STOPPED: LazyLock<Mutex<VecDeque<(String, String)>>> =
    LazyLock::new(|| Mutex::new(VecDeque::new()));
pub(super) struct SearchRequest {
    owner: String,
    id: String,
    pub cancellation: Cancellation,
}
impl SearchRequest {
    pub fn begin(owner: &str, id: &str) -> Self {
        let cancellation = Cancellation::default();
        let mut active = ACTIVE.lock().unwrap_or_else(|error| error.into_inner());
        let mut stopped = STOPPED.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(index) = stopped
            .iter()
            .position(|(window, request)| window == owner && request == id)
        {
            stopped.remove(index);
            cancellation.cancel();
            return Self {
                owner: owner.into(),
                id: id.into(),
                cancellation,
            };
        }
        if let Some(previous) = active.insert(
            owner.into(),
            Active {
                id: id.into(),
                cancellation: cancellation.clone(),
            },
        ) {
            previous.cancellation.cancel();
        }
        Self {
            owner: owner.into(),
            id: id.into(),
            cancellation,
        }
    }
}
impl Drop for SearchRequest {
    fn drop(&mut self) {
        let mut active = ACTIVE.lock().unwrap_or_else(|error| error.into_inner());
        if active
            .get(&self.owner)
            .is_some_and(|request| request.id == self.id)
        {
            active.remove(&self.owner);
        }
    }
}
pub(super) fn cancel(owner: &str, id: &str) {
    let active = ACTIVE.lock().unwrap_or_else(|error| error.into_inner());
    if let Some(request) = active.get(owner).filter(|request| request.id == id) {
        request.cancellation.cancel();
    }
    let mut stopped = STOPPED.lock().unwrap_or_else(|error| error.into_inner());
    if stopped.len() >= 256 {
        stopped.pop_front();
    }
    stopped.push_back((owner.into(), id.into()));
}

// Results contain immutable commit IDs, never worktree contents. Both the query
// and all traversal boundaries are part of the key. Bound total retained memory.
#[derive(Default)]
struct Cache {
    entries: VecDeque<(String, Arc<Vec<String>>, usize)>,
    bytes: usize,
}
impl Cache {
    fn get(&mut self, key: &str) -> Option<Arc<Vec<String>>> {
        let index = self.entries.iter().position(|entry| entry.0 == key)?;
        let entry = self.entries.remove(index)?;
        let result = entry.1.clone();
        self.entries.push_front(entry);
        Some(result)
    }
    fn put(&mut self, key: String, hashes: Arc<Vec<String>>) {
        const BUDGET: usize = 16 * 1024 * 1024;
        let bytes = key.capacity()
            + hashes.capacity() * std::mem::size_of::<String>()
            + hashes.iter().map(String::capacity).sum::<usize>();
        if bytes > BUDGET {
            return;
        }
        if let Some(index) = self.entries.iter().position(|entry| entry.0 == key) {
            self.bytes -= self.entries.remove(index).unwrap().2;
        }
        while self.entries.len() >= 8 || self.bytes + bytes > BUDGET {
            let Some(entry) = self.entries.pop_back() else {
                break;
            };
            self.bytes -= entry.2;
        }
        self.bytes += bytes;
        self.entries.push_front((key, hashes, bytes));
    }
}
static CACHE: LazyLock<Mutex<Cache>> = LazyLock::new(|| Mutex::new(Cache::default()));
#[cfg(test)]
thread_local! { static HITS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) }; }
#[cfg(test)]
pub(super) fn hits() -> usize {
    HITS.get()
}
pub(super) fn cached(key: &str) -> Option<Arc<Vec<String>>> {
    let value = CACHE
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(key);
    #[cfg(test)]
    if value.is_some() {
        HITS.set(HITS.get() + 1);
    }
    value
}
pub(super) fn remember(key: String, hashes: Arc<Vec<String>>) {
    CACHE
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .put(key, hashes);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn latest_request_only_and_cancellation_are_isolated_by_window() {
        let first = SearchRequest::begin("test-a", "1");
        let other = SearchRequest::begin("test-b", "2");
        let latest = SearchRequest::begin("test-a", "3");
        assert!(first.cancellation.check().is_err());
        drop(first);
        cancel("test-a", "1");
        assert!(latest.cancellation.check().is_ok());
        cancel("test-a", "3");
        assert!(latest.cancellation.check().is_err());
        assert!(other.cancellation.check().is_ok());
    }
    #[test]
    fn cancellation_before_registration_does_not_replace_a_newer_search() {
        cancel("test-delayed", "old");
        let current = SearchRequest::begin("test-delayed", "new");
        let delayed = SearchRequest::begin("test-delayed", "old");
        assert!(delayed.cancellation.check().is_err());
        assert!(current.cancellation.check().is_ok());
    }
    #[test]
    fn cache_bounds_entries_touches_recent_results_and_remembers_no_matches() {
        let mut cache = Cache::default();
        for index in 0..8 {
            cache.put(index.to_string(), Arc::new(vec![]));
        }
        assert!(cache.get("0").unwrap().is_empty());
        cache.put("8".into(), Arc::new(vec!["commit".into()]));
        assert!(cache.get("1").is_none());
        assert!(cache.get("0").is_some());
        assert_eq!(cache.get("8").unwrap()[0], "commit");
        cache.put("huge".into(), Arc::new(vec!["x".repeat(17 * 1024 * 1024)]));
        assert!(cache.get("huge").is_none());
        assert!(cache.bytes <= 16 * 1024 * 1024);
    }
}
