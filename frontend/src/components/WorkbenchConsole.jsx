import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Grid,
  Input,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Select,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react'
import {
  IconCheckCircle,
  IconCloseCircle,
  IconCloudDownload,
  IconRefresh,
} from '@arco-design/web-react/icon'

const { Row, Col } = Grid
const { Title, Text } = Typography
const Option = Select.Option

function StatusTag({ status, getJobBadgeClass, getJobStatusText }) {
  const cls = getJobBadgeClass(status)
  const colorMap = { 'is-success': 'green', 'is-danger': 'red', 'is-warning': 'orange', 'is-muted': 'gray' }
  return <Tag color={colorMap[cls] || 'gray'} size="small">{getJobStatusText(status)}</Tag>
}

function InfoCard({ label, value, note, children }) {
  return (
    <Card bodyStyle={{ padding: 16 }} style={{ height: '100%' }}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <div style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 4px', lineHeight: 1.3 }}>{value}</div>
      <Text type="secondary" style={{ fontSize: 12 }}>{note}</Text>
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </Card>
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

  /* ── 任务列表列定义 ──────────────────────────────────────────────── */
  const jobColumns = [
    {
      title: '任务', width: 180,
      render: (_, job) => (
        <div>
          <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{job.job_id}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{getJobCompactStats(job)}</Text>
        </div>
      ),
    },
    {
      title: '来源', width: 180,
      render: (_, job) => (
        <div>
          <Text style={{ fontSize: 12 }}>{getSourceTypeText(job.payload?.source_type)}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
            {job.payload?.source_type === 'sftp'
              ? `${job.payload?.sftp_host || '--'} / ${job.payload?.sftp_path || '/'}`
              : `${job.payload?.bucket_name || '--'} / ${job.payload?.prefix || '/'}`}
          </Text>
        </div>
      ),
    },
    {
      title: '状态', width: 90,
      render: (_, job) => <StatusTag status={job.status} getJobBadgeClass={getJobBadgeClass} getJobStatusText={getJobStatusText} />,
    },
    {
      title: '进度', width: 120,
      render: (_, job) => {
        const p = getJobProgress(job)
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Progress percent={p} showText={false} size="small" style={{ flex: 1 }} />
            <Text style={{ fontSize: 11, fontFeatureSettings: '"tnum"' }}>{p}%</Text>
          </div>
        )
      },
    },
    {
      title: '更新时间', width: 140,
      render: (_, job) => <Text style={{ fontSize: 12 }}>{job.updated_at ? formatDateTime(job.updated_at) : '--'}</Text>,
    },
    {
      title: '操作', width: 200,
      render: (_, job) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Button size="mini" type={selectedJobId === job.job_id ? 'primary' : 'default'} onClick={() => onSelectJob(job.job_id)}>选中</Button>
          <Button size="mini" onClick={() => onReuseJobConfig(job)}>复用</Button>
          <Button size="mini" onClick={() => onOpenJobDetail(job.job_id)}>详情</Button>
          {['pending', 'running', 'cancelling'].includes(job.status) && (
            <Button size="mini" status="danger" onClick={() => onCancelJob(job.job_id)}>取消</Button>
          )}
        </div>
      ),
    },
  ]

  /* ── 扫描表格列定义 ──────────────────────────────────────────────── */
  const scanColumns = [
    {
      title: '选择', width: 50,
      render: (_, item) => item.supported
        ? <Checkbox checked={selectedScanKeys.includes(item.key)} onChange={() => onToggleScanSelection(item.key)} />
        : null,
    },
    {
      title: '文件名',
      render: (_, item) => (
        <div>
          <Text style={{ fontSize: 12 }}>{item.name || '-'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>扩展名：{item.ext || '-'}</Text>
        </div>
      ),
    },
    { title: '对象 Key', dataIndex: 'key', render: (v) => <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>{v}</Text> },
    { title: '类型', dataIndex: 'category', render: (v) => v || 'other', width: 80 },
    { title: '大小', width: 80, render: (_, item) => formatBytes(item.size) },
    { title: '最后修改', width: 140, render: (_, item) => item.last_modified ? formatDateTime(item.last_modified) : '--' },
    {
      title: '可处理', width: 70,
      render: (_, item) => <Tag color={item.supported ? 'green' : 'gray'} size="small">{item.supported ? '支持' : '跳过'}</Tag>,
    },
  ]

  return (
    <div style={{ padding: 20, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      {/* ── 页头 ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>接入工作台</Title>
          <Text type="secondary">S3/SFTP 远程来源接入 · 目录扫描 · 批量入湖 · 索引构建</Text>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<IconCloudDownload />} onClick={onNavigateUpload}>本地上传</Button>
          <Button icon={<IconRefresh />} loading={refreshing} onClick={onRefresh}>刷新</Button>
        </div>
      </div>

      {/* ── 提示条 ──────────────────────────────────────────────────── */}
      {banner.message && (
        <Alert
          type={banner.type === 'success' ? 'success' : banner.type === 'warning' ? 'warning' : 'info'}
          content={banner.message}
          style={{ marginBottom: 12 }}
        />
      )}
      {error && <Alert type="error" content={error} style={{ marginBottom: 12 }} />}

      {/* ── 操作栏 ──────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Lake Storage</Text>
            <div style={{ fontSize: 16, fontWeight: 600, margin: '4px 0' }}>先连来源，再扫对象，最后发起导入</div>
            <Text type="secondary" style={{ fontSize: 13 }}>{selectionStatusText}</Text>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button onClick={onSave} loading={saving}>保存配置</Button>
            <Button onClick={onTestConnection} loading={testing}>测试连接</Button>
            <Button type="primary" onClick={onScan} loading={scanning}>执行扫描</Button>
            <Button type="primary" onClick={onOpenStartConfirm} loading={starting} disabled={!scanResult.objects.length && !selectedScanKeys.length}>启动任务</Button>
            <Button onClick={onBuildIndex} loading={buildingIndex} disabled={form.index_strategy === 'none' || (form.index_strategy === 'custom' && !form.index_type)}>构建索引</Button>
          </div>
        </div>
      </Card>

      {/* ── 状态卡片 ────────────────────────────────────────────────── */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <InfoCard label="当前来源" value={sourceModeText} note={sourceLocationText}>
            <Button size="mini" onClick={onOpenSourceModal}>编辑来源</Button>
          </InfoCard>
        </Col>
        <Col span={6}>
          <InfoCard label="扫描结果" value={formatNumber(scanResult.returned_count)} note={scanStatusText}>
            <Button size="mini" onClick={onOpenScanModal}>扫描明细</Button>
          </InfoCard>
        </Col>
        <Col span={6}>
          <InfoCard label="索引状态" value={currentIndexModeLabel} note={`文本 ${indexStatus.text.row_count} / 图像 ${indexStatus.image.row_count} / 索引 ${totalIndexCount}`}>
            <Button size="mini" onClick={onOpenIndexModal}>索引配置</Button>
          </InfoCard>
        </Col>
        <Col span={6}>
          <InfoCard label="任务态势" value={formatNumber(activeJobs)} note={`完成 ${formatNumber(completedJobs)} / 失败 ${formatNumber(failedJobs)}`}>
            {selectedJobId
              ? <Button size="mini" onClick={() => onOpenJobDetail(selectedJobId)}>当前任务</Button>
              : <Tag color="gray" size="small">未选中任务</Tag>}
          </InfoCard>
        </Col>
      </Row>

      {/* ── 导入准备度 + 预览 ───────────────────────────────────────── */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="导入准备度" extra={<Text type="secondary" style={{ fontSize: 12 }}>现在能不能发起任务</Text>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { ready: !!connectionData, title: '连接验证', desc: connectionData ? '已拿到样本结果，可以继续扫描。' : '还没有完成连接验证。' },
                { ready: scanResult.objects.length > 0, title: '扫描结果', desc: scanResult.objects.length ? scanStatusText : '还没有扫描结果。' },
                { ready: !!(selectedScanKeys.length || scanResult.eligible_count), title: '导入范围', desc: selectionStatusText },
              ].map((item) => (
                <div key={item.title} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  borderRadius: 8, background: item.ready ? 'rgba(0,180,42,0.06)' : 'var(--color-fill-1)',
                  border: `1px solid ${item.ready ? 'rgba(0,180,42,0.2)' : 'var(--color-border-1)'}`,
                }}>
                  {item.ready
                    ? <IconCheckCircle style={{ color: '#00B42A', fontSize: 16, flexShrink: 0 }} />
                    : <IconCloseCircle style={{ color: '#c9cdd4', fontSize: 16, flexShrink: 0 }} />}
                  <div>
                    <Text style={{ fontWeight: 500, fontSize: 13 }}>{item.title}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Text>
                  </div>
                </div>
              ))}
            </div>
            {connectionData && <Alert type="success" content={getConnectionSummary(connectionData)} style={{ marginTop: 12 }} />}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="已选对象预览" extra={<Button size="mini" onClick={onOpenScanModal}>查看扫描明细</Button>}>
            {previewItems.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {previewItems.map((item) => (
                  <div key={item.key} style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--color-fill-1)' }}>
                    <Text style={{ fontSize: 12 }}>{item.name || item.key}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>{item.key}</Text>
                  </div>
                ))}
              </div>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>还没有手动勾选对象。可以直接启动任务，也可以先打开扫描弹窗做更细的选择。</Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 任务记录 ────────────────────────────────────────────────── */}
      <Card title="任务记录" extra={<Text type="secondary" style={{ fontSize: 12 }}>任务列表只做筛选和决策，日志与详情统一弹窗查看</Text>}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>状态</Text>
            <Select value={jobStatusFilter} onChange={onSetJobStatusFilter} style={{ width: 120 }} size="small">
              {jobStatusOptions.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>排序</Text>
            <Select value={jobSort} onChange={onSetJobSort} style={{ width: 150 }} size="small">
              {jobSortOptions.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>搜索</Text>
            <Input value={jobKeyword} onChange={onSetJobKeyword} size="small" placeholder="搜索 job_id、主机、Bucket 或路径" />
          </div>
        </div>
        {filteredJobs.length ? (
          <Table columns={jobColumns} data={filteredJobs} rowKey="job_id" pagination={false} size="small" scroll={{ x: 900 }} />
        ) : (
          <Empty description="当前没有任务记录" />
        )}
      </Card>

      {/* ── 弹窗：编辑来源 ──────────────────────────────────────────── */}
      <Modal title="编辑来源" visible={sourceModalOpen} onCancel={onCloseSourceModal} footer={null} style={{ width: 640 }}>
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>来源类型</Text>
          <Radio.Group type="button" value={form.source_type} onChange={onSourceTypeChange}>
            {sourceTypeOptions.map((o) => <Radio key={o.value} value={o.value}>{o.label}</Radio>)}
          </Radio.Group>
        </div>
        <Row gutter={[16, 12]}>
          {form.source_type === 's3' ? (
            <>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>S3 Endpoint</Text><Input name="endpoint_url" value={form.endpoint_url} onChange={(v) => onInputChange({ target: { name: 'endpoint_url', value: v, type: 'text' } })} /></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Bucket</Text><Input name="bucket_name" value={form.bucket_name} onChange={(v) => onInputChange({ target: { name: 'bucket_name', value: v, type: 'text' } })} /></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>目录前缀</Text><Input name="prefix" value={form.prefix} onChange={(v) => onInputChange({ target: { name: 'prefix', value: v, type: 'text' } })} /></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Access Key</Text><Input name="access_key_id" value={form.access_key_id} onChange={(v) => onInputChange({ target: { name: 'access_key_id', value: v, type: 'text' } })} /></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Secret Key</Text><Input.Password name="secret_access_key" value={form.secret_access_key} onChange={(v) => onInputChange({ target: { name: 'secret_access_key', value: v, type: 'password' } })} /></Col>
            </>
          ) : (
            <>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SFTP 主机</Text><Input name="sftp_host" value={form.sftp_host} onChange={(v) => onInputChange({ target: { name: 'sftp_host', value: v, type: 'text' } })} /></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SFTP 端口</Text><InputNumber name="sftp_port" value={form.sftp_port} onChange={(v) => onInputChange({ target: { name: 'sftp_port', value: v, type: 'number' } })} style={{ width: '100%' }} /></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>用户名</Text><Input name="sftp_user" value={form.sftp_user} onChange={(v) => onInputChange({ target: { name: 'sftp_user', value: v, type: 'text' } })} /></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>密码</Text><Input.Password name="sftp_password" value={form.sftp_password} onChange={(v) => onInputChange({ target: { name: 'sftp_password', value: v, type: 'password' } })} /></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>远程路径</Text><Input name="sftp_path" value={form.sftp_path} onChange={(v) => onInputChange({ target: { name: 'sftp_path', value: v, type: 'text' } })} /></Col>
            </>
          )}
        </Row>
      </Modal>

      {/* ── 弹窗：扫描明细 ──────────────────────────────────────────── */}
      <Modal title="扫描明细" visible={scanModalOpen} onCancel={onCloseScanModal} footer={null} style={{ width: 900 }}>
        <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>扫描上限</Text>
            <InputNumber name="scan_limit" value={form.scan_limit} onChange={(v) => onInputChange({ target: { name: 'scan_limit', value: v, type: 'number' } })} style={{ width: '100%' }} />
          </Col>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>导入文件数上限</Text>
            <InputNumber name="max_files" value={form.max_files} onChange={(v) => onInputChange({ target: { name: 'max_files', value: v, type: 'number' } })} style={{ width: '100%' }} />
          </Col>
          <Col span={8}>
            <Checkbox checked={form.overwrite_existing} onChange={(v) => onInputChange({ target: { name: 'overwrite_existing', checked: v, type: 'checkbox' } })}>覆盖已存在文件</Checkbox>
          </Col>
        </Row>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>类型筛选</Text>
            <Select value={scanCategoryFilter} onChange={onSetScanCategoryFilter} style={{ width: 120 }} size="small">
              {scanCategories.map((o) => <Option key={o} value={o}>{o === 'all' ? '全部类型' : o}</Option>)}
            </Select>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>每页条数</Text>
            <Select value={scanPageSize} onChange={onSetScanPageSize} style={{ width: 100 }} size="small">
              {scanPageSizeOptions.map((o) => <Option key={o} value={o}>{o}</Option>)}
            </Select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>搜索</Text>
            <Input value={scanKeyword} onChange={onSetScanKeyword} size="small" placeholder="搜索文件名、对象 Key、扩展名或类型" />
          </div>
          <Checkbox checked={scanSupportedOnly} onChange={onSetScanSupportedOnly}>仅看支持项</Checkbox>
          <Button size="small" onClick={onSelectAllScanObjects} disabled={!filteredSupportedScanObjects.length}>全选</Button>
          <Button size="small" onClick={onClearSelectedScanObjects} disabled={!selectedScanKeys.length}>清空</Button>
        </div>
        {connectionData && <Alert type="success" content={getConnectionSummary(connectionData)} style={{ marginBottom: 12 }} />}
        {scanResult.objects.length ? (
          <>
            <Table columns={scanColumns} data={pagedScanObjects} rowKey="key" pagination={false} size="small" scroll={{ x: 700 }} />
            {filteredScanObjects.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>第 {scanPage} / {scanPageCount} 页，共 {formatNumber(filteredScanObjects.length)} 条</Text>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="mini" disabled={scanPage <= 1} onClick={() => onSetScanPage(scanPage - 1)}>上一页</Button>
                  <Button size="mini" disabled={scanPage >= scanPageCount} onClick={() => onSetScanPage(scanPage + 1)}>下一页</Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <Empty description="先测试连接或执行扫描，这里会展示待处理对象清单。" />
        )}
      </Modal>

      {/* ── 弹窗：索引策略 ──────────────────────────────────────────── */}
      <Modal title="索引策略" visible={indexModalOpen} onCancel={onCloseIndexModal} footer={null} style={{ width: 520 }}>
        <Row gutter={[16, 12]}>
          <Col span={24}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>索引模式</Text>
            <Select value={currentIndexMode} onChange={(v) => onInputChange({ target: { name: 'index_mode', value: v } })} style={{ width: '100%' }}>
              {indexModeOptions.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </Col>
          {showPartitionField(currentIndexMode) && (
            <Col span={12}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>分区数</Text>
              <InputNumber name="num_partitions" value={form.num_partitions} onChange={(v) => onInputChange({ target: { name: 'num_partitions', value: v, type: 'number' } })} style={{ width: '100%' }} />
            </Col>
          )}
          {showSubVectorField(currentIndexMode) && (
            <Col span={12}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>PQ 子向量数</Text>
              <InputNumber name="num_sub_vectors" value={form.num_sub_vectors} onChange={(v) => onInputChange({ target: { name: 'num_sub_vectors', value: v, type: 'number' } })} style={{ width: '100%' }} />
            </Col>
          )}
        </Row>
        <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
          <Checkbox checked={form.build_text_index} onChange={(v) => onInputChange({ target: { name: 'build_text_index', checked: v, type: 'checkbox' } })}>构建文本向量索引</Checkbox>
          <Checkbox checked={form.build_image_index} onChange={(v) => onInputChange({ target: { name: 'build_image_index', checked: v, type: 'checkbox' } })}>构建图像向量索引</Checkbox>
        </div>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>当前索引明细：文本 {getIndicesText(indexStatus.text.indices)}；图像 {getIndicesText(indexStatus.image.indices)}</Text>
      </Modal>

      {/* ── 弹窗：确认启动 ──────────────────────────────────────────── */}
      <Modal title="确认启动任务" visible={startConfirmOpen} onCancel={onCloseStartConfirm} footer={null} style={{ width: 520 }}>
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={12}><InfoCard label="来源类型" value={sourceModeText} note={sourceLocationText} /></Col>
          <Col span={12}><InfoCard label="索引模式" value={currentIndexModeLabel} note={`上限 ${formatNumber(form.max_files)} / 已勾选 ${selectedScanKeys.length ? formatNumber(selectedScanKeys.length) : '未指定'}`} /></Col>
        </Row>
        <Alert type="warning" content={selectionStatusText} style={{ marginBottom: 16 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCloseStartConfirm}>取消</Button>
          <Button type="primary" loading={starting} onClick={onConfirmStart}>确认启动</Button>
        </div>
      </Modal>

      {/* ── 弹窗：任务详情 ──────────────────────────────────────────── */}
      <Modal title={`任务详情 — ${jobDetail?.job_id || ''}`} visible={jobModalOpen && Boolean(jobDetail)} onCancel={onCloseJobModal} footer={null} style={{ width: 700 }}>
        {jobDetail && (
          <>
            <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>来源类型</Text>
                <div style={{ marginTop: 4 }}>{getSourceTypeText(jobDetail.payload?.source_type)}</div>
              </Col>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>来源主值</Text>
                <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}>{getSourcePrimaryValue(jobDetail.payload)}</div>
              </Col>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>来源路径</Text>
                <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}>{getSourceSecondaryValue(jobDetail.payload)}</div>
              </Col>
            </Row>
            <Alert type="success" content={getJobResultSummary(jobDetail)} style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Button size="small" onClick={() => onCopyLogs(jobDetail.logs)}>复制日志</Button>
              <Button size="small" onClick={() => onExportLogs(jobDetail)}>导出日志</Button>
            </div>
            <pre style={{
              background: '#1d2129', color: '#c9cdd4',
              padding: 16, borderRadius: 6, fontSize: 12,
              fontFamily: 'Consolas, monospace', maxHeight: 400, overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
            }}>{jobDetail.logs || '暂无任务日志。'}</pre>
          </>
        )}
      </Modal>
    </div>
  )
}
