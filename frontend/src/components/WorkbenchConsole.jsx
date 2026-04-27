function ModalShell({ open, title, subtitle, badge, onClose, children }) {
  if (!open) return null
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
          <button type="button" className="button button-small button-ghost" onClick={onClose}>关闭</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function InfoCard({ label, value, note, tone = 'neutral', children }) {
  return (
    <section className={`workbench-metric-card is-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="workbench-metric-value">{value}</div>
      <div className="workbench-metric-note">{note}</div>
      {children ? <div className="workbench-metric-action">{children}</div> : null}
    </section>
  )
}

export default function WorkbenchConsole({ vm, actions, helpers }) {
  const {
    banner, error, form, scanResult, indexStatus, connectionData, filteredJobs, jobDetail, selectedJobId,
    selectedScanKeys, pagedScanObjects, filteredScanObjects, filteredSupportedScanObjects, scanPage, scanPageCount,
    scanPageSize, scanCategories, scanCategoryFilter, scanKeyword, scanSupportedOnly, jobStatusFilter, jobKeyword,
    jobSort, refreshing, saving, testing, scanning, starting, buildingIndex, sourceModalOpen, scanModalOpen,
    indexModalOpen, startConfirmOpen, jobModalOpen, activeJobs, completedJobs, failedJobs, currentIndexMode,
    currentIndexModeLabel, selectionStatusText, sourceModeText, sourceLocationText, scanStatusText, totalIndexCount
  } = vm

  const {
    onNavigateUpload, onRefresh, onOpenSourceModal, onCloseSourceModal, onOpenScanModal, onCloseScanModal,
    onOpenIndexModal, onCloseIndexModal, onOpenStartConfirm, onCloseStartConfirm, onCloseJobModal, onInputChange,
    onSourceTypeChange, onSave, onTestConnection, onScan, onBuildIndex, onConfirmStart, onSelectAllScanObjects,
    onClearSelectedScanObjects, onToggleScanSelection, onSetScanCategoryFilter, onSetScanPageSize, onSetScanKeyword,
    onSetScanSupportedOnly, onSetScanPage, onSetJobStatusFilter, onSetJobKeyword, onSetJobSort, onSelectJob,
    onOpenJobDetail, onReuseJobConfig, onCancelJob, onCopyLogs, onExportLogs
  } = actions

  const {
    formatNumber, formatBytes, formatDateTime, getSourceTypeText, getSourcePrimaryValue, getSourceSecondaryValue,
    getJobBadgeClass, getJobStatusText, getJobCompactStats, getJobProgress, getJobResultSummary, getConnectionSummary,
    getIndicesText, sourceTypeOptions, indexModeOptions, showPartitionField, showSubVectorField,
    scanPageSizeOptions, jobStatusOptions, jobSortOptions
  } = helpers

  const previewItems = pagedScanObjects.filter((item) => selectedScanKeys.includes(item.key)).slice(0, 3)

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">接入工作台</h1>
          <p className="page-subtitle">重构后的页面只保留操作台该有的东西：状态、选择和动作。明细全部进弹窗。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={onNavigateUpload}>本地上传</button>
          <button type="button" className="button button-secondary" onClick={onRefresh} disabled={refreshing}>{refreshing ? '刷新中...' : '刷新状态'}</button>
        </div>
      </div>

      {banner.message ? <div className={`${banner.type}-banner`}>{banner.message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="glass-card workbench-redesign-hero">
        <div>
          <div className="section-title">Lake Storage</div>
          <h2 className="workbench-redesign-title">先连来源，再扫对象，最后发起导入</h2>
          <p className="workbench-redesign-note">{selectionStatusText}</p>
        </div>
        <div className="workbench-redesign-actions">
          <button type="button" className="button button-secondary" onClick={onSave} disabled={saving}>{saving ? '保存中...' : '保存配置'}</button>
          <button type="button" className="button button-secondary" onClick={onTestConnection} disabled={testing}>{testing ? '测试中...' : '测试连接'}</button>
          <button type="button" className="button button-primary" onClick={onScan} disabled={scanning}>{scanning ? '扫描中...' : '执行扫描'}</button>
          <button type="button" className="button button-primary" onClick={onOpenStartConfirm} disabled={starting || (!scanResult.objects.length && !selectedScanKeys.length)}>{starting ? '启动中...' : '启动任务'}</button>
          <button type="button" className="button button-ghost" onClick={onBuildIndex} disabled={buildingIndex || form.index_strategy === 'none' || (form.index_strategy === 'custom' && !form.index_type)}>{buildingIndex ? '构建中...' : '构建索引'}</button>
        </div>
      </section>

      <section className="workbench-redesign-grid">
        <InfoCard label="当前来源" value={sourceModeText} note={sourceLocationText} tone="semantic">
          <button type="button" className="button button-small button-secondary" onClick={onOpenSourceModal}>编辑来源</button>
        </InfoCard>
        <InfoCard label="扫描结果" value={formatNumber(scanResult.returned_count)} note={scanStatusText} tone="kinetic">
          <button type="button" className="button button-small button-secondary" onClick={onOpenScanModal}>扫描明细</button>
        </InfoCard>
        <InfoCard label="索引状态" value={currentIndexModeLabel} note={`文本 ${indexStatus.text.row_count} / 图像 ${indexStatus.image.row_count} / 索引 ${totalIndexCount}`} tone="dynamic">
          <button type="button" className="button button-small button-secondary" onClick={onOpenIndexModal}>索引配置</button>
        </InfoCard>
        <InfoCard label="任务态势" value={formatNumber(activeJobs)} note={`完成 ${formatNumber(completedJobs)} / 失败 ${formatNumber(failedJobs)}`}>
          {selectedJobId ? <button type="button" className="button button-small button-secondary" onClick={() => onOpenJobDetail(selectedJobId)}>当前任务</button> : <span className="badge is-muted">未选中任务</span>}
        </InfoCard>
      </section>

      <section className="glass-card workbench-redesign-summary">
        <div className="workbench-redesign-summary-main">
          <div className="card-header">
            <div>
              <h2>导入准备度</h2>
              <p>这里只回答一个问题：现在能不能发起任务。</p>
            </div>
          </div>
          <div className="workbench-readiness-list">
            <div className={`workbench-readiness-item ${connectionData ? 'is-ready' : ''}`}>
              <span className="workbench-readiness-dot" />
              <div>
                <div className="table-primary">连接验证</div>
                <div className="table-secondary">{connectionData ? '已拿到样本结果，可以继续扫描。' : '还没有完成连接验证。'}</div>
              </div>
            </div>
            <div className={`workbench-readiness-item ${scanResult.objects.length ? 'is-ready' : ''}`}>
              <span className="workbench-readiness-dot" />
              <div>
                <div className="table-primary">扫描结果</div>
                <div className="table-secondary">{scanResult.objects.length ? scanStatusText : '还没有扫描结果。'}</div>
              </div>
            </div>
            <div className={`workbench-readiness-item ${(selectedScanKeys.length || scanResult.eligible_count) ? 'is-ready' : ''}`}>
              <span className="workbench-readiness-dot" />
              <div>
                <div className="table-primary">导入范围</div>
                <div className="table-secondary">{selectionStatusText}</div>
              </div>
            </div>
          </div>
          {connectionData ? <div className="success-banner">{getConnectionSummary(connectionData)}</div> : null}
        </div>

        <div className="workbench-redesign-summary-side">
          <div className="card-header">
            <div>
              <h2>已选对象预览</h2>
              <p>主页面只展示结果，不再铺完整对象表。</p>
            </div>
            <button type="button" className="button button-small button-secondary" onClick={onOpenScanModal}>查看扫描明细</button>
          </div>
          <div className="workbench-preview-list">
            {previewItems.length ? (
              previewItems.map((item) => (
                <div className="workbench-preview-item" key={item.key}>
                  <div className="table-primary">{item.name || item.key}</div>
                  <div className="table-secondary mono">{item.key}</div>
                </div>
              ))
            ) : (
              <div className="workbench-summary-note">还没有手动勾选对象。可以直接启动任务，也可以先打开扫描弹窗做更细的选择。</div>
            )}
          </div>
        </div>
      </section>

      <section className="glass-card">
        <div className="card-header">
          <div>
            <h2>任务记录</h2>
            <p>任务列表只做筛选和决策，日志与详情统一弹窗查看。</p>
          </div>
          <span className="badge">Jobs</span>
        </div>
        <div className="toolbar workbench-table-toolbar">
          <div className="toolbar-group">
            <div className="field compact-field">
              <label htmlFor="job_status_filter">状态</label>
              <select id="job_status_filter" className="select" value={jobStatusFilter} onChange={(event) => onSetJobStatusFilter(event.target.value)}>
                {jobStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field compact-field">
              <label htmlFor="job_sort">排序</label>
              <select id="job_sort" className="select" value={jobSort} onChange={(event) => onSetJobSort(event.target.value)}>
                {jobSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field grow-field">
              <label htmlFor="job_keyword">搜索任务</label>
              <input id="job_keyword" className="input" value={jobKeyword} onChange={(event) => onSetJobKeyword(event.target.value)} placeholder="搜索 job_id、主机、Bucket 或路径" />
            </div>
          </div>
        </div>
        {filteredJobs.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>任务</th><th>来源</th><th>状态</th><th>进度</th><th>更新时间</th><th>操作</th></tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.job_id} className={selectedJobId === job.job_id ? 'table-row-active' : ''}>
                    <td><div className="table-primary mono">{job.job_id}</div><div className="table-secondary">{getJobCompactStats(job)}</div></td>
                    <td><div className="table-primary">{getSourceTypeText(job.payload?.source_type)}</div><div className="table-secondary mono">{job.payload?.source_type === 'sftp' ? `${job.payload?.sftp_host || '--'} / ${job.payload?.sftp_path || '/'}` : `${job.payload?.bucket_name || '--'} / ${job.payload?.prefix || '/'}`}</div></td>
                    <td><span className={`badge ${getJobBadgeClass(job.status)}`}>{getJobStatusText(job.status)}</span></td>
                    <td><div className="job-progress-row"><div className="job-progress-track"><div className="job-progress-value" style={{ width: `${getJobProgress(job)}%` }} /></div><span className="mono">{getJobProgress(job)}%</span></div></td>
                    <td>{job.updated_at ? formatDateTime(job.updated_at) : '--'}</td>
                    <td><div className="toolbar-group"><button type="button" className="button button-small button-secondary" onClick={() => onSelectJob(job.job_id)}>选中</button><button type="button" className="button button-small button-ghost" onClick={() => onReuseJobConfig(job)}>复用</button><button type="button" className="button button-small button-ghost" onClick={() => onOpenJobDetail(job.job_id)}>详情</button>{['pending', 'running', 'cancelling'].includes(job.status) ? <button type="button" className="button button-small button-ghost" onClick={() => onCancelJob(job.job_id)}>取消</button> : null}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state small">当前没有任务记录。</div>}
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

      <ModalShell open={scanModalOpen} title="扫描明细" subtitle="在弹窗里完成筛选、勾选和分页浏览" onClose={onCloseScanModal}>
        <div className="workbench-form-grid">
          <div className="field"><label htmlFor="scan_limit">扫描上限</label><input id="scan_limit" name="scan_limit" type="number" min="1" max="2000" className="input" value={form.scan_limit} onChange={onInputChange} /></div>
          <div className="field"><label htmlFor="max_files">导入文件数上限</label><input id="max_files" name="max_files" type="number" min="1" max="5000" className="input" value={form.max_files} onChange={onInputChange} /></div>
        </div>
        <div className="workbench-switch-grid">
          <label className="checkbox-field"><input type="checkbox" name="overwrite_existing" checked={form.overwrite_existing} onChange={onInputChange} /><span>覆盖已存在文件</span></label>
        </div>
        <div className="toolbar workbench-table-toolbar workbench-scan-toolbar">
          <div className="toolbar-group">
            <div className="field compact-field"><label htmlFor="scan_category_filter">类型筛选</label><select id="scan_category_filter" className="select" value={scanCategoryFilter} onChange={(event) => onSetScanCategoryFilter(event.target.value)}>{scanCategories.map((option) => <option key={option} value={option}>{option === 'all' ? '全部类型' : option}</option>)}</select></div>
            <div className="field compact-field"><label htmlFor="scan_page_size">每页条数</label><select id="scan_page_size" className="select" value={scanPageSize} onChange={(event) => onSetScanPageSize(Number(event.target.value))}>{scanPageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
            <div className="field grow-field"><label htmlFor="scan_keyword">扫描搜索</label><input id="scan_keyword" className="input" value={scanKeyword} onChange={(event) => onSetScanKeyword(event.target.value)} placeholder="搜索文件名、对象 Key、扩展名或类型" /></div>
            <label className="checkbox-field"><input type="checkbox" checked={scanSupportedOnly} onChange={(event) => onSetScanSupportedOnly(event.target.checked)} /><span>仅看支持项</span></label>
          </div>
          <div className="toolbar-group">
            <button type="button" className="button button-small button-secondary" onClick={onSelectAllScanObjects} disabled={!filteredSupportedScanObjects.length}>全选当前筛选</button>
            <button type="button" className="button button-small button-ghost" onClick={onClearSelectedScanObjects} disabled={!selectedScanKeys.length}>清空勾选</button>
          </div>
        </div>
        {connectionData ? <div className="success-banner workbench-inline-banner">{getConnectionSummary(connectionData)}</div> : null}
        {scanResult.objects.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>选择</th><th>文件名</th><th>对象 Key</th><th>类型</th><th>大小</th><th>最后修改</th><th>可处理</th></tr></thead><tbody>{pagedScanObjects.map((item) => <tr key={item.key}><td>{item.supported ? <input type="checkbox" className="table-checkbox" checked={selectedScanKeys.includes(item.key)} onChange={() => onToggleScanSelection(item.key)} /> : null}</td><td><div className="table-primary">{item.name || '-'}</div><div className="table-secondary">扩展名：{item.ext || '-'}</div></td><td className="table-secondary mono">{item.key}</td><td>{item.category || 'other'}</td><td>{formatBytes(item.size)}</td><td>{item.last_modified ? formatDateTime(item.last_modified) : '--'}</td><td><span className={`badge ${item.supported ? 'is-success' : 'is-muted'}`}>{item.supported ? '支持' : '跳过'}</span></td></tr>)}</tbody></table></div> : <div className="empty-state small">先测试连接或执行扫描，这里会展示待处理对象清单。</div>}
        {filteredScanObjects.length ? <div className="pagination"><span className="pagination-meta">第 {formatNumber(scanPage)} / {formatNumber(scanPageCount)} 页，共 {formatNumber(filteredScanObjects.length)} 条</span><div className="toolbar-group"><button type="button" className="button button-small button-secondary" onClick={() => onSetScanPage(Math.max(1, scanPage - 1))} disabled={scanPage <= 1}>上一页</button><button type="button" className="button button-small button-secondary" onClick={() => onSetScanPage(Math.min(scanPageCount, scanPage + 1))} disabled={scanPage >= scanPageCount}>下一页</button></div></div> : null}
      </ModalShell>

      <ModalShell open={indexModalOpen} title="索引策略" subtitle="设置向量索引构建模式与高级参数" onClose={onCloseIndexModal}>
        <div className="workbench-form-grid">
          <div className="field"><label htmlFor="index_mode">索引模式</label><select id="index_mode" name="index_mode" className="select" value={currentIndexMode} onChange={onInputChange}>{indexModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          {showPartitionField(currentIndexMode) ? <div className="field"><label htmlFor="num_partitions">分区数</label><input id="num_partitions" name="num_partitions" type="number" min="1" className="input" value={form.num_partitions} onChange={onInputChange} placeholder="自动" /></div> : null}
          {showSubVectorField(currentIndexMode) ? <div className="field"><label htmlFor="num_sub_vectors">PQ 子向量数</label><input id="num_sub_vectors" name="num_sub_vectors" type="number" min="1" className="input" value={form.num_sub_vectors} onChange={onInputChange} placeholder="IVF_PQ / IVF_HNSW_PQ 时生效" /></div> : null}
        </div>
        <div className="workbench-switch-grid">
          <label className="checkbox-field"><input type="checkbox" name="build_text_index" checked={form.build_text_index} onChange={onInputChange} /><span>构建文本向量索引</span></label>
          <label className="checkbox-field"><input type="checkbox" name="build_image_index" checked={form.build_image_index} onChange={onInputChange} /><span>构建图像向量索引</span></label>
        </div>
        <div className="table-secondary">当前索引明细：文本 {getIndicesText(indexStatus.text.indices)}；图像 {getIndicesText(indexStatus.image.indices)}</div>
      </ModalShell>

      <ModalShell open={startConfirmOpen} title="确认启动任务" subtitle="在启动前再次确认本次导入范围与策略" onClose={onCloseStartConfirm}>
        <div className="detail-grid">
          <InfoCard label="来源类型" value={sourceModeText} note={sourceLocationText} />
          <InfoCard label="索引模式" value={currentIndexModeLabel} note={`导入上限 ${formatNumber(form.max_files)} / 已勾选 ${selectedScanKeys.length ? formatNumber(selectedScanKeys.length) : '未指定'}`} />
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
              <DetailItem label="来源类型" value={getSourceTypeText(jobDetail.payload?.source_type)} />
              <DetailItem label="来源主值" value={getSourcePrimaryValue(jobDetail.payload)} />
              <DetailItem label="来源路径" value={getSourceSecondaryValue(jobDetail.payload)} mono />
              <DetailItem label="结果摘要" value={getJobCompactStats(jobDetail)} />
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
