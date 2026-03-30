function ModalShell({ open, title, subtitle, badge, onClose, children }) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-panel glass-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            <div className="modal-subtitle">
              <span>{subtitle}</span>
              {badge ? <span className="badge">{badge}</span> : null}
            </div>
          </div>
          <button type="button" className="button button-small button-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export default function WorkbenchConsole({ vm, actions, helpers }) {
  const {
    banner,
    error,
    form,
    scanResult,
    indexStatus,
    connectionData,
    filteredJobs,
    jobDetail,
    selectedJobId,
    selectedScanKeys,
    pagedScanObjects,
    filteredScanObjects,
    filteredSupportedScanObjects,
    scanPage,
    scanPageCount,
    scanPageSize,
    scanCategories,
    scanCategoryFilter,
    scanKeyword,
    scanSupportedOnly,
    jobStatusFilter,
    jobKeyword,
    jobSort,
    refreshing,
    saving,
    testing,
    scanning,
    starting,
    buildingIndex,
    sourceModalOpen,
    scanModalOpen,
    indexModalOpen,
    startConfirmOpen,
    jobModalOpen,
    activeJobs,
    completedJobs,
    failedJobs,
    currentIndexMode,
    currentIndexModeLabel,
    selectionStatusText,
    sourceModeText,
    sourceLocationText,
    scanStatusText,
    totalIndexCount,
    selectedJobProgress
  } = vm

  const {
    onNavigateUpload,
    onRefresh,
    onOpenSourceModal,
    onCloseSourceModal,
    onOpenScanModal,
    onCloseScanModal,
    onOpenIndexModal,
    onCloseIndexModal,
    onOpenStartConfirm,
    onCloseStartConfirm,
    onCloseJobModal,
    onInputChange,
    onSourceTypeChange,
    onSave,
    onTestConnection,
    onScan,
    onBuildIndex,
    onConfirmStart,
    onSelectAllScanObjects,
    onClearSelectedScanObjects,
    onToggleScanSelection,
    onSetScanCategoryFilter,
    onSetScanPageSize,
    onSetScanKeyword,
    onSetScanSupportedOnly,
    onSetScanPage,
    onSetJobStatusFilter,
    onSetJobKeyword,
    onSetJobSort,
    onSelectJob,
    onOpenJobDetail,
    onReuseJobConfig,
    onCancelJob,
    onCopyLogs,
    onExportLogs
  } = actions

  const {
    formatNumber,
    formatBytes,
    formatDateTime,
    getSourceTypeText,
    getSourcePrimaryLabel,
    getSourcePrimaryValue,
    getSourceSecondaryLabel,
    getSourceSecondaryValue,
    getJobBadgeClass,
    getJobStatusText,
    getJobCompactStats,
    getJobProgress,
    getJobResultSummary,
    getConnectionSummary,
    getIndicesText,
    sourceTypeOptions,
    indexModeOptions,
    showPartitionField,
    showSubVectorField,
    scanPageSizeOptions,
    jobStatusOptions,
    jobSortOptions
  } = helpers

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">接入与扫描</h1>
          <p className="page-subtitle">
            以来源连接、扫描预览和任务执行为主线组织接入流程。配置参数收进弹窗，主页面只保留结果、状态和关键操作。
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={onNavigateUpload}>
            本地上传
          </button>
          <button type="button" className="button button-secondary" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? '刷新中...' : '刷新状态'}
          </button>
        </div>
      </div>

      {banner.message ? <div className={`${banner.type}-banner`}>{banner.message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="glass-card workbench-console-panel">
        <div className="workbench-guide-strip">
          <span className="badge">Remote Source</span>
          <span className="workbench-guide-copy">
            这里处理的是来源级接入: 连接远程来源、扫描目录或对象、确认结果后批量入湖。若数据已在本机，请走“本地上传”。
          </span>
        </div>

        <div className="workbench-summary-grid">
          <div className="workbench-summary-card">
            <div className="kpi-label">当前来源</div>
            <div className="workbench-summary-value">{sourceModeText}</div>
            <div className="workbench-summary-note mono">{sourceLocationText}</div>
            <button type="button" className="button button-small button-secondary" onClick={onOpenSourceModal}>
              编辑来源
            </button>
          </div>
          <div className="workbench-summary-card">
            <div className="kpi-label">扫描状态</div>
            <div className="workbench-summary-value">{formatNumber(scanResult.returned_count)}</div>
            <div className="workbench-summary-note">{scanStatusText}</div>
            <button type="button" className="button button-small button-secondary" onClick={onOpenScanModal}>
              扫描设置
            </button>
          </div>
          <div className="workbench-summary-card">
            <div className="kpi-label">索引策略</div>
            <div className="workbench-summary-value">{currentIndexModeLabel}</div>
            <div className="workbench-summary-note">文本 {indexStatus.text.row_count} / 图像 {indexStatus.image.row_count} / 索引 {totalIndexCount}</div>
            <button type="button" className="button button-small button-secondary" onClick={onOpenIndexModal}>
              索引策略
            </button>
          </div>
          <div className="workbench-summary-card">
            <div className="kpi-label">任务态势</div>
            <div className="workbench-summary-value">{formatNumber(activeJobs)}</div>
            <div className="workbench-summary-note">执行中 {formatNumber(activeJobs)} / 完成 {formatNumber(completedJobs)} / 失败 {formatNumber(failedJobs)}</div>
            <button type="button" className="button button-small button-secondary" onClick={() => selectedJobId && onSelectJob(selectedJobId)}>
              刷新详情
            </button>
          </div>
        </div>

        <div className="workbench-actionbar">
          <div className="toolbar-group">
            <button type="button" className="button button-secondary" onClick={onSave} disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </button>
            <button type="button" className="button button-secondary" onClick={onTestConnection} disabled={testing}>
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button type="button" className="button button-primary" onClick={onScan} disabled={scanning}>
              {scanning ? '扫描中...' : '执行扫描'}
            </button>
            <button type="button" className="button button-primary" onClick={onOpenStartConfirm} disabled={starting || (!scanResult.objects.length && !selectedScanKeys.length)}>
              {starting ? '启动中...' : '启动任务'}
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={onBuildIndex}
              disabled={buildingIndex || form.index_strategy === 'none' || (form.index_strategy === 'custom' && !form.index_type)}
            >
              {buildingIndex ? '构建中...' : '手动建索引'}
            </button>
          </div>
          <div className="workbench-help">{selectionStatusText}</div>
        </div>
      </section>

      <div className="workbench-results-shell">
        <section className="glass-card workbench-main-panel">
          <div className="card-header">
            <div>
              <h2>扫描结果</h2>
              <p>筛选来源对象，决定本次批量入湖范围。若存在勾选，将优先导入勾选结果。</p>
            </div>
            <span className={`badge ${scanResult.truncated ? 'is-warning' : 'is-muted'}`}>{scanResult.truncated ? '结果已截断' : '完整结果'}</span>
          </div>

          <div className="toolbar workbench-table-toolbar">
            <div className="toolbar-group">
              <div className="field compact-field">
                <label htmlFor="scan_category_filter">类型筛选</label>
                <select id="scan_category_filter" className="select" value={scanCategoryFilter} onChange={(event) => onSetScanCategoryFilter(event.target.value)}>
                  {scanCategories.map((option) => (
                    <option key={option} value={option}>{option === 'all' ? '全部类型' : option}</option>
                  ))}
                </select>
              </div>
              <div className="field compact-field">
                <label htmlFor="scan_page_size">每页条数</label>
                <select id="scan_page_size" className="select" value={scanPageSize} onChange={(event) => onSetScanPageSize(Number(event.target.value))}>
                  {scanPageSizeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="field grow-field">
                <label htmlFor="scan_keyword">扫描搜索</label>
                <input id="scan_keyword" className="input" value={scanKeyword} onChange={(event) => onSetScanKeyword(event.target.value)} placeholder="搜索文件名、对象 Key、扩展名或类型" />
              </div>
              <label className="checkbox-field">
                <input type="checkbox" checked={scanSupportedOnly} onChange={(event) => onSetScanSupportedOnly(event.target.checked)} />
                <span>仅看支持项</span>
              </label>
              <button type="button" className="button button-small button-secondary" onClick={onSelectAllScanObjects} disabled={!filteredSupportedScanObjects.length}>
                全选当前筛选
              </button>
              <button type="button" className="button button-small button-ghost" onClick={onClearSelectedScanObjects} disabled={!selectedScanKeys.length}>
                清空勾选
              </button>
            </div>
          </div>

          {connectionData ? <div className="success-banner workbench-inline-banner">{getConnectionSummary(connectionData)}</div> : null}

          {scanResult.objects.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>选择</th>
                    <th>文件名</th>
                    <th>对象 Key</th>
                    <th>类型</th>
                    <th>大小</th>
                    <th>最后修改</th>
                    <th>可处理</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedScanObjects.map((item) => (
                    <tr key={item.key}>
                      <td>
                        {item.supported ? (
                          <input type="checkbox" className="table-checkbox" checked={selectedScanKeys.includes(item.key)} onChange={() => onToggleScanSelection(item.key)} />
                        ) : null}
                      </td>
                      <td>
                        <div className="table-primary">{item.name || '-'}</div>
                        <div className="table-secondary">扩展名：{item.ext || '-'}</div>
                      </td>
                      <td className="table-secondary mono">{item.key}</td>
                      <td>{item.category || 'other'}</td>
                      <td>{formatBytes(item.size)}</td>
                      <td>{item.last_modified ? formatDateTime(item.last_modified) : '--'}</td>
                      <td>
                        <span className={`badge ${item.supported ? 'is-success' : 'is-muted'}`}>{item.supported ? '支持' : '跳过'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state small">{form.source_type === 's3' ? '先测试连接或执行扫描，这里会展示待处理对象清单。' : '先测试连接或执行扫描，这里会展示待处理文件清单。'}</div>
          )}

          {filteredScanObjects.length ? (
            <div className="pagination">
              <span className="pagination-meta">第 {formatNumber(scanPage)} / {formatNumber(scanPageCount)} 页，共 {formatNumber(filteredScanObjects.length)} 条</span>
              <div className="toolbar-group">
                <button type="button" className="button button-small button-secondary" onClick={() => onSetScanPage(Math.max(1, scanPage - 1))} disabled={scanPage <= 1}>上一页</button>
                <button type="button" className="button button-small button-secondary" onClick={() => onSetScanPage(Math.min(scanPageCount, scanPage + 1))} disabled={scanPage >= scanPageCount}>下一页</button>
              </div>
            </div>
          ) : null}
        </section>

        <div className="workbench-side-stack">
          <section className="glass-card">
            <div className="card-header">
              <div>
                <h2>当前配置摘要</h2>
                <p>来源、范围和索引策略常驻展示，避免频繁回头翻配置。</p>
              </div>
            </div>
            <div className="detail-grid">
              <div className="detail-item"><div className="kpi-label">{getSourcePrimaryLabel(form.source_type)}</div><div className="detail-value">{getSourcePrimaryValue(form)}</div></div>
              <div className="detail-item"><div className="kpi-label">{getSourceSecondaryLabel(form.source_type)}</div><div className="detail-value mono">{getSourceSecondaryValue(form)}</div></div>
              <div className="detail-item"><div className="kpi-label">扫描上限</div><div className="detail-value">{formatNumber(form.scan_limit)}</div></div>
              <div className="detail-item"><div className="kpi-label">导入上限</div><div className="detail-value">{formatNumber(form.max_files)}</div></div>
              <div className="detail-item"><div className="kpi-label">索引模式</div><div className="detail-value">{currentIndexModeLabel}</div></div>
              <div className="detail-item"><div className="kpi-label">覆盖策略</div><div className="detail-value">{form.overwrite_existing ? '覆盖已存在文件' : '保留已有结果'}</div></div>
            </div>
            {connectionData ? <div className="success-banner">{getConnectionSummary(connectionData)}</div> : <div className="warning-banner">当前尚未完成连接验证，建议在执行扫描前先测试连接。</div>}
          </section>

          <section className="glass-card">
            <div className="card-header">
              <div>
                <h2>索引与任务态势</h2>
                <p>把关键数字压缩到右侧固定视野里。</p>
              </div>
            </div>
            <div className="mini-kpi-grid workbench-side-kpis">
              <div className="glass-card mini-kpi-card"><div className="kpi-label">扫描返回</div><div className="kpi-value">{formatNumber(scanResult.returned_count)}</div><div className="kpi-sub">本次扫描对象数</div></div>
              <div className="glass-card mini-kpi-card"><div className="kpi-label">可处理</div><div className="kpi-value">{formatNumber(scanResult.eligible_count)}</div><div className="kpi-sub">命中当前入湖能力</div></div>
              <div className="glass-card mini-kpi-card"><div className="kpi-label">活动任务</div><div className="kpi-value">{formatNumber(activeJobs)}</div><div className="kpi-sub">排队中或执行中</div></div>
              <div className="glass-card mini-kpi-card"><div className="kpi-label">索引数量</div><div className="kpi-value">{formatNumber(totalIndexCount)}</div><div className="kpi-sub">文本与图像索引总和</div></div>
            </div>

            <div className="index-status-list">
              {['text', 'image'].map((name) => {
                const item = indexStatus?.[name] || { row_count: 0, indices: [] }
                return (
                  <div className="index-status-card" key={name}>
                    <div className="index-status-head">
                      <div className="table-primary">{name === 'text' ? '文本表' : '图像表'}</div>
                      <span className={`badge ${item.indices?.length ? 'is-success' : 'is-muted'}`}>{item.indices?.length ? `${item.indices.length} 个索引` : '未建索引'}</span>
                    </div>
                    <div className="kpi-value index-status-value">{formatNumber(item.row_count)}</div>
                    <div className="kpi-sub">当前表行数</div>
                    <div className="table-secondary">索引明细：{getIndicesText(item.indices)}</div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>

      <section className="glass-card">
        <div className="card-header">
          <div>
            <h2>任务记录</h2>
            <p>按状态、关键词和排序查看最近批量任务。选中任务后，详情和日志显示在下方。</p>
          </div>
          <span className="badge">Jobs</span>
        </div>

        <div className="toolbar workbench-table-toolbar">
          <div className="toolbar-group">
            <div className="field compact-field">
              <label htmlFor="job_status_filter">状态</label>
              <select id="job_status_filter" className="select" value={jobStatusFilter} onChange={(event) => onSetJobStatusFilter(event.target.value)}>
                {jobStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field compact-field">
              <label htmlFor="job_sort">排序</label>
              <select id="job_sort" className="select" value={jobSort} onChange={(event) => onSetJobSort(event.target.value)}>
                {jobSortOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field grow-field">
              <label htmlFor="job_keyword">搜索任务</label>
              <input id="job_keyword" className="input" value={jobKeyword} onChange={(event) => onSetJobKeyword(event.target.value)} placeholder="搜索 job_id、来源主机、Bucket、路径或状态" />
            </div>
          </div>
        </div>

        {filteredJobs.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>任务</th>
                  <th>来源</th>
                  <th>状态</th>
                  <th>进度</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.job_id} className={selectedJobId === job.job_id ? 'table-row-active' : ''}>
                    <td>
                      <div className="table-primary mono">{job.job_id}</div>
                      <div className="table-secondary">{getJobCompactStats(job)}</div>
                    </td>
                    <td>
                      <div className="table-primary">{getSourceTypeText(job.payload?.source_type)}</div>
                      <div className="table-secondary mono">{job.payload?.source_type === 'sftp' ? `${job.payload?.sftp_host || '--'} / ${job.payload?.sftp_path || '/'}` : `${job.payload?.bucket_name || '--'} / ${job.payload?.prefix || '/'}`}</div>
                    </td>
                    <td>
                      <span className={`badge ${getJobBadgeClass(job.status)}`}>{getJobStatusText(job.status)}</span>
                    </td>
                    <td>
                      <div className="job-progress-row">
                        <div className="job-progress-track">
                          <div className="job-progress-value" style={{ width: `${getJobProgress(job)}%` }} />
                        </div>
                        <span className="mono">{getJobProgress(job)}%</span>
                      </div>
                    </td>
                    <td>{job.updated_at ? formatDateTime(job.updated_at) : '--'}</td>
                    <td>
                      <div className="toolbar-group">
                        <button type="button" className="button button-small button-secondary" onClick={() => onSelectJob(job.job_id)}>选中</button>
                        <button type="button" className="button button-small button-ghost" onClick={() => onReuseJobConfig(job)}>复用</button>
                        <button type="button" className="button button-small button-ghost" onClick={() => onOpenJobDetail(job.job_id)}>详情</button>
                        {['pending', 'running', 'cancelling'].includes(job.status) ? (
                          <button type="button" className="button button-small button-ghost" onClick={() => onCancelJob(job.job_id)}>取消</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state small">当前没有任务记录。</div>
        )}
      </section>

      <section className="glass-card">
        <div className="card-header">
          <div>
            <h2>任务详情</h2>
            <p>选中任务后查看来源参数、结果摘要和处理日志。</p>
          </div>
          {jobDetail ? <span className={`badge ${getJobBadgeClass(jobDetail.status)}`}>{getJobStatusText(jobDetail.status)}</span> : null}
        </div>

        {jobDetail ? (
          <>
            <div className="detail-grid">
              <div className="detail-item"><div className="kpi-label">任务编号</div><div className="detail-value mono">{jobDetail.job_id}</div></div>
              <div className="detail-item"><div className="kpi-label">来源类型</div><div className="detail-value">{getSourceTypeText(jobDetail.payload?.source_type)}</div></div>
              <div className="detail-item"><div className="kpi-label">{getSourcePrimaryLabel(jobDetail.payload?.source_type)}</div><div className="detail-value">{getSourcePrimaryValue(jobDetail.payload)}</div></div>
              <div className="detail-item"><div className="kpi-label">{getSourceSecondaryLabel(jobDetail.payload?.source_type)}</div><div className="detail-value mono">{getSourceSecondaryValue(jobDetail.payload)}</div></div>
              <div className="detail-item"><div className="kpi-label">更新时间</div><div className="detail-value">{jobDetail.updated_at ? formatDateTime(jobDetail.updated_at) : '--'}</div></div>
              <div className="detail-item"><div className="kpi-label">任务进度</div><div className="detail-value">{selectedJobProgress}%</div></div>
            </div>

            <div className="success-banner">{getJobResultSummary(jobDetail)}</div>

            <div className="toolbar workbench-table-toolbar">
              <div className="toolbar-group">
                <button type="button" className="button button-small button-secondary" onClick={() => onCopyLogs(jobDetail.logs)}>复制日志</button>
                <button type="button" className="button button-small button-secondary" onClick={() => onExportLogs(jobDetail)}>导出日志</button>
                <button type="button" className="button button-small button-ghost" onClick={() => onOpenJobDetail(jobDetail.job_id)}>全屏查看</button>
              </div>
            </div>

            <div className="log-viewer">{jobDetail.logs || '暂无任务日志。'}</div>
          </>
        ) : (
          <div className="empty-state small">先从上面的任务记录中选中一条任务。</div>
        )}
      </section>

      <ModalShell open={sourceModalOpen} title="编辑来源" subtitle="切换来源类型并维护连接参数" badge={sourceModeText} onClose={onCloseSourceModal}>
        <div className="workbench-source-toggle">
          {sourceTypeOptions.map((option) => (
            <button key={option.value} type="button" className={`workbench-source-chip ${form.source_type === option.value ? 'is-active' : ''}`} onClick={() => onSourceTypeChange(option.value)}>
              <span className="workbench-source-chip-title">{option.label}</span>
              <span className="workbench-source-chip-hint">{option.hint}</span>
            </button>
          ))}
        </div>

        <div className="workbench-form-grid">
          {form.source_type === 's3' ? (
            <>
              <div className="field"><label htmlFor="endpoint_url">S3 Endpoint</label><input id="endpoint_url" name="endpoint_url" className="input" value={form.endpoint_url} onChange={onInputChange} placeholder="http://127.0.0.1:8333" /></div>
              <div className="field"><label htmlFor="bucket_name">Bucket</label><input id="bucket_name" name="bucket_name" className="input" value={form.bucket_name} onChange={onInputChange} placeholder="multimodal-lake-bucket" /></div>
              <div className="field"><label htmlFor="prefix">目录前缀</label><input id="prefix" name="prefix" className="input" value={form.prefix} onChange={onInputChange} placeholder="raw/docs/2026" /></div>
              <div className="field"><label htmlFor="access_key_id">Access Key</label><input id="access_key_id" name="access_key_id" className="input" value={form.access_key_id} onChange={onInputChange} placeholder="mykey" /></div>
              <div className="field"><label htmlFor="secret_access_key">Secret Key</label><input id="secret_access_key" name="secret_access_key" type="password" className="input" value={form.secret_access_key} onChange={onInputChange} placeholder="请输入密钥" /></div>
            </>
          ) : (
            <>
              <div className="field"><label htmlFor="sftp_host">SFTP 主机</label><input id="sftp_host" name="sftp_host" className="input" value={form.sftp_host} onChange={onInputChange} placeholder="192.168.20.10" /></div>
              <div className="field"><label htmlFor="sftp_port">SFTP 端口</label><input id="sftp_port" name="sftp_port" type="number" min="1" max="65535" className="input" value={form.sftp_port} onChange={onInputChange} placeholder="22" /></div>
              <div className="field"><label htmlFor="sftp_user">用户名</label><input id="sftp_user" name="sftp_user" className="input" value={form.sftp_user} onChange={onInputChange} placeholder="root" /></div>
              <div className="field"><label htmlFor="sftp_password">密码</label><input id="sftp_password" name="sftp_password" type="password" className="input" value={form.sftp_password} onChange={onInputChange} placeholder="请输入密码" /></div>
              <div className="field"><label htmlFor="sftp_path">远程路径</label><input id="sftp_path" name="sftp_path" className="input" value={form.sftp_path} onChange={onInputChange} placeholder="/tmp" /></div>
            </>
          )}
        </div>
      </ModalShell>

      <ModalShell open={scanModalOpen} title="扫描设置" subtitle="定义扫描范围和导入上限" onClose={onCloseScanModal}>
        <div className="workbench-form-grid">
          <div className="field"><label htmlFor="scan_limit">扫描上限</label><input id="scan_limit" name="scan_limit" type="number" min="1" max="2000" className="input" value={form.scan_limit} onChange={onInputChange} /></div>
          <div className="field"><label htmlFor="max_files">导入文件数上限</label><input id="max_files" name="max_files" type="number" min="1" max="5000" className="input" value={form.max_files} onChange={onInputChange} /></div>
        </div>
        <div className="workbench-switch-grid">
          <label className="checkbox-field">
            <input type="checkbox" name="overwrite_existing" checked={form.overwrite_existing} onChange={onInputChange} />
            <span>覆盖已存在文件</span>
          </label>
        </div>
      </ModalShell>

      <ModalShell open={indexModalOpen} title="索引策略" subtitle="设置向量索引构建模式与高级参数" onClose={onCloseIndexModal}>
        <div className="workbench-form-grid">
          <div className="field">
            <label htmlFor="index_mode">索引模式</label>
            <select id="index_mode" name="index_mode" className="select" value={currentIndexMode} onChange={onInputChange}>
              {indexModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {showPartitionField(currentIndexMode) ? (
            <div className="field"><label htmlFor="num_partitions">分区数</label><input id="num_partitions" name="num_partitions" type="number" min="1" className="input" value={form.num_partitions} onChange={onInputChange} placeholder="自动" /></div>
          ) : null}
          {showSubVectorField(currentIndexMode) ? (
            <div className="field"><label htmlFor="num_sub_vectors">PQ 子向量数</label><input id="num_sub_vectors" name="num_sub_vectors" type="number" min="1" className="input" value={form.num_sub_vectors} onChange={onInputChange} placeholder="IVF_PQ / IVF_HNSW_PQ 时生效" /></div>
          ) : null}
        </div>
        <div className="workbench-switch-grid">
          <label className="checkbox-field"><input type="checkbox" name="build_text_index" checked={form.build_text_index} onChange={onInputChange} /><span>构建文本向量索引</span></label>
          <label className="checkbox-field"><input type="checkbox" name="build_image_index" checked={form.build_image_index} onChange={onInputChange} /><span>构建图像向量索引</span></label>
        </div>
      </ModalShell>

      <ModalShell open={startConfirmOpen} title="确认启动任务" subtitle="在启动前再次确认本次导入范围与策略" onClose={onCloseStartConfirm}>
        <div className="detail-grid">
          <div className="detail-item"><div className="kpi-label">来源类型</div><div className="detail-value">{sourceModeText}</div></div>
          <div className="detail-item"><div className="kpi-label">{getSourcePrimaryLabel(form.source_type)}</div><div className="detail-value">{getSourcePrimaryValue(form)}</div></div>
          <div className="detail-item"><div className="kpi-label">{getSourceSecondaryLabel(form.source_type)}</div><div className="detail-value mono">{getSourceSecondaryValue(form)}</div></div>
          <div className="detail-item"><div className="kpi-label">索引模式</div><div className="detail-value">{currentIndexModeLabel}</div></div>
          <div className="detail-item"><div className="kpi-label">勾选对象</div><div className="detail-value">{selectedScanKeys.length ? formatNumber(selectedScanKeys.length) : '未指定'}</div></div>
          <div className="detail-item"><div className="kpi-label">导入上限</div><div className="detail-value">{formatNumber(form.max_files)}</div></div>
        </div>
        <div className="warning-banner">{selectionStatusText}</div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={onCloseStartConfirm}>取消</button>
          <button type="button" className="button button-primary" disabled={starting} onClick={onConfirmStart}>{starting ? '启动中...' : '确认启动'}</button>
        </div>
      </ModalShell>

      <ModalShell open={jobModalOpen && Boolean(jobDetail)} title="任务详情" subtitle={jobDetail ? jobDetail.job_id : ''} badge={jobDetail ? getJobStatusText(jobDetail.status) : ''} onClose={onCloseJobModal}>
        {jobDetail ? (
          <>
            <div className="detail-grid">
              <div className="detail-item"><div className="kpi-label">来源类型</div><div className="detail-value">{getSourceTypeText(jobDetail.payload?.source_type)}</div></div>
              <div className="detail-item"><div className="kpi-label">{getSourcePrimaryLabel(jobDetail.payload?.source_type)}</div><div className="detail-value">{getSourcePrimaryValue(jobDetail.payload)}</div></div>
              <div className="detail-item"><div className="kpi-label">{getSourceSecondaryLabel(jobDetail.payload?.source_type)}</div><div className="detail-value mono">{getSourceSecondaryValue(jobDetail.payload)}</div></div>
              <div className="detail-item"><div className="kpi-label">结果摘要</div><div className="detail-value">{getJobCompactStats(jobDetail)}</div></div>
            </div>
            <div className="success-banner">{getJobResultSummary(jobDetail)}</div>
            <div className="toolbar workbench-table-toolbar">
              <div className="toolbar-group">
                <button type="button" className="button button-small button-secondary" onClick={() => onCopyLogs(jobDetail.logs)}>复制日志</button>
                <button type="button" className="button button-small button-secondary" onClick={() => onExportLogs(jobDetail)}>导出日志</button>
              </div>
            </div>
            <div className="log-viewer">{jobDetail.logs || '暂无任务日志。'}</div>
          </>
        ) : null}
      </ModalShell>
    </div>
  )
}
