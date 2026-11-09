// Display the existing helper status; local writes and conflicts are independent.
function syncLabel(status) {
    if (!status) return '正在读取同步状态…'
    if (!status.configured) return '仅本地 · 尚未配置云端'
    if (status.syncing) return '同步中'
    if (status.sync.error) return (status.sync.authPaused ? '认证已暂停 · ' : '连接失败 · ') + status.sync.error.message
    if (status.pending) return `待同步 · ${status.pending} 项操作`
    if (!status.sync.lastSuccess) return '待同步 · 尚未完成首次同步'
    return '已同步'
}
module.exports = { syncLabel }
