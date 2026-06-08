import {
  IconApps,
  IconBug,
  IconCalendarClock,
  IconCloudDownload,
  IconCommand,
  IconCommon,
  IconDashboard,
  IconExport,
  IconFile,
  IconLanguage,
  IconLayout,
  IconLock,
  IconNotification,
  IconRobot,
  IconSafe,
  IconSearch,
  IconSettings,
  IconStorage,
  IconUpload,
  IconUser,
  IconUserGroup,
} from '@arco-design/web-react/icon'

export const navGroups = [
  {
    key: 'lake-overview',
    title: '湖总览',
    icon: <IconDashboard />,
    items: [
      { path: '/dashboard', label: '湖仓总览', icon: <IconDashboard /> },
      { path: '/files', label: '资产目录', icon: <IconFile /> },
    ],
  },
  {
    key: 'lake-query',
    title: '湖查询',
    icon: <IconSearch />,
    items: [
      { path: '/lake-query/sql', label: 'SQL 查询', icon: <IconCommand /> },
      { path: '/lake-query/retrieval', label: '统一检索', icon: <IconSearch /> },
      { path: '/lake-query/vector', label: '向量检索', icon: <IconSearch /> },
      { path: '/lake-query/multimodal', label: '多模态检索', icon: <IconLayout /> },
      { path: '/lake-query/hybrid', label: '混合检索', icon: <IconCommon /> },
      { path: '/lake-query/copilot', label: 'AI 数据副驾驶', icon: <IconRobot /> },
      { path: '/lake-query/annotation', label: '自动化标注', icon: <IconExport /> },
    ],
  },
  {
    key: 'lake-compute',
    title: '湖计算',
    icon: <IconApps />,
    items: [
      { path: '/workflow', label: '工作流编排', icon: <IconLayout /> },
      { path: '/compute/operators', label: '算子中心', icon: <IconCommon /> },
      { path: '/task-center', label: '任务中心', icon: <IconCalendarClock /> },
      { path: '/compute/jobs', label: '作业实例', icon: <IconRobot /> },
      { path: '/compute/templates', label: '模板库', icon: <IconFile /> },
    ],
  },
  {
    key: 'lake-storage',
    title: '湖存储',
    icon: <IconStorage />,
    items: [
      { path: '/ingestion', label: '总览', icon: <IconStorage /> },
      { path: '/ingestion/source', label: '来源接入', icon: <IconCloudDownload /> },
      { path: '/ingestion/upload', label: '本地上传', icon: <IconUpload /> },
    ],
  },
  {
    key: 'lake-governance',
    title: '湖治理',
    icon: <IconSafe />,
    items: [
      { path: '/governance', label: '数据治理', icon: <IconSafe /> },
    ],
  },
  {
    key: 'mpp-database',
    title: '湖运维',
    icon: <IconDashboard />,
    items: [
      { path: '/mpp/cluster', label: '集群管理', icon: <IconCommon /> },
      { path: '/mpp/sql', label: 'SQL 编辑器', icon: <IconCommand /> },
      { path: '/mpp/alert', label: '告警监控', icon: <IconNotification /> },
      { path: '/mpp/inspection', label: '自动巡检', icon: <IconBug /> },
    ],
  },
  {
    key: 'system-config',
    title: '系统配置',
    icon: <IconSettings />,
    items: [
      { path: '/settings/access', label: '来源配置', icon: <IconSettings /> },
      { path: '/logs', label: '系统日志', icon: <IconLanguage /> },
    ],
  },
  {
    key: 'admin-tools',
    title: '管理入口',
    icon: <IconLock />,
    requiresAdmin: true,
    items: [
      { path: '/settings/users', label: '用户管理', icon: <IconUser />, requiresAdmin: true },
      { path: '/settings/permissions', label: '权限管理', icon: <IconUserGroup />, requiresAdmin: true },
    ],
  },
]

export const allNavItems = navGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, groupKey: group.key, groupTitle: group.title }))
)

export function getVisibleNavGroups({ isAdmin }) {
  return navGroups
    .filter((group) => !group.requiresAdmin || isAdmin)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.hidden && (!item.requiresAdmin || isAdmin)),
    }))
    .filter((group) => group.items.length > 0)
}

export function findCurrentNav(pathname) {
  return (
    allNavItems
      .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
      .sort((left, right) => right.path.length - left.path.length)[0] || allNavItems[0]
  )
}
