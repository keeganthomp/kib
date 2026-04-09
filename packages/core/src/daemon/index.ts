export {
	type FolderWatcherOptions,
	matchGlob,
	scanFolder,
	startFolderWatchers,
	type WatchFolder,
} from "./folder-watcher.js";
export { appendWatchLog } from "./log.js";
export { getDaemonStatus, type PidInfo, readPid, removePid, stopDaemon, writePid } from "./pid.js";
export {
	clearFailed,
	dequeue,
	enqueue,
	ensureQueueDirs,
	listFailed,
	listPending,
	markFailed,
	type QueueItem,
	queueDepth,
	readItem,
} from "./queue.js";
export { CompileScheduler, type SchedulerOptions } from "./scheduler.js";
export {
	detectPlatform,
	type InstallResult,
	installService,
	isServiceInstalled,
	type ServicePlatform,
	uninstallService,
} from "./service.js";
