#!/usr/bin/env python
# -*- coding: utf-8 -*-
import sys

MAPPING = {
    "style: clean up CSS — remove duplicate dark-sidebar root block, add lp-* login styles":
        "style: 清理 CSS — 移除重复的深色侧边栏根块，新增 lp-* 登录样式",
    "feat: replace ML logo with BONC brand image":
        "feat: 用 BONC 品牌图片替换 ML logo",
    "fix: use subprocess instead of os.execv for conda env switch on Windows":
        "fix: Windows 下用 subprocess 替代 os.execv 做 conda 环境切换",
    "fix: replace curly quotes with straight quotes in JSX files":
        "fix: 把 JSX 文件里的弯引号替换为直引号",
    "feat: redesign login page to Volcengine LAS style":
        "feat: 登录页重设计为火山引擎 LAS 风格",
    "refactor: rewrite start.py with start/stop/status/restart commands":
        "refactor: 重写 start.py，支持 start/stop/status/restart 命令",
    "feat: redesign shell layout to match Volcengine LAS style":
        "feat: 主框架布局重设计为火山引擎 LAS 风格",
    "docs: update ports to 27843/27844 in README":
        "docs: README 中端口更新为 27843/27844",
    "feat: change ports to backend=27843 frontend=27844":
        "feat: 端口调整为 后端 27843 / 前端 27844",
    "feat: auto-switch to conda env 'multimodal-lake' on startup":
        "feat: 启动时自动切换到 conda 环境 'multimodal-lake'",
    "fix: pin numpy<2.0 to avoid binary compatibility issues":
        "fix: 锁定 numpy<2.0 以避免二进制兼容问题",
    "refactor: move log files into logs/ directory":
        "refactor: 日志文件移入 logs/ 目录",
    "docs: rewrite README with professional format":
        "docs: 用专业格式重写 README",
    "feat: refresh platform shell visual design":
        "feat: 刷新平台主框架视觉设计",
    "Flatten sidebar navigation styling":
        "扁平化侧边栏导航样式",
    "Refine upload and source-config pages in Byte-style":
        "字节风格优化上传页与来源配置页",
    "Redesign ingestion workbench as a tool-first console":
        "接入工作台重设计为工具优先的控制台",
    "Convert sidebar navigation to accordion menus":
        "侧边栏导航改为手风琴折叠菜单",
    "Group logs and access settings under system config":
        "把日志和来源配置归入系统配置组",
    "Move system logs out of primary navigation":
        "把系统日志移出一级导航",
    "Explain ingestion entry points in upload and workbench":
        "在上传与工作台中说明接入入口的差异",
    "Clarify local upload versus ingestion workbench":
        "明确本地上传与接入工作台的边界",
    "Reorganize console navigation around lake domains":
        "围绕湖业务域重组控制台导航",
    "Remove exposed default credentials from login UI":
        "从登录页移除暴露的默认账号",
    "Add authenticated login flow to console":
        "控制台新增带鉴权的登录流程",
    "Make auto-push hook work on Windows":
        "让自动推送 hook 在 Windows 上可用",
    "Reorganize console nav and add auto-push hook":
        "重组控制台导航并新增自动推送 hook",
    "Translate shell chrome to Chinese":
        "把主框架文案翻译为中文",
    "Centralize Doris config in access settings":
        "Doris 配置集中到来源配置页",
    "chore: commit remaining generated artifacts":
        "chore: 提交剩余的生成产物",
    "feat: auto-commit completed agent tasks":
        "feat: 自动提交已完成的 agent 任务",
    "feat: continue autonomous lake product cleanup":
        "feat: 继续自动化清理湖仓产品",
    "refactor: remove remaining mock product fallbacks":
        "refactor: 移除剩余的 mock 产品回退逻辑",
    "feat: disable mock fallback by default":
        "feat: 默认关闭 mock 回退",
    "refactor: keep agent team internal to the lake build":
        "refactor: 把 agent team 收敛到湖仓构建内部",
    "feat: add agent request intake workflow":
        "feat: 新增 agent 请求受理流程",
    "feat: add executable offline agent runtime":
        "feat: 新增可执行的离线 agent 运行时",
    "refactor: remove legacy ui and architecture artifacts":
        "refactor: 移除旧版 UI 与架构遗留产物",
    "refactor: remove legacy vue frontend sources":
        "refactor: 移除旧版 Vue 前端源码",
    "fix: advance planning-only agent tasks to ready":
        "fix: 仅有规划的 agent 任务推进到 ready 状态",
    "fix: unify backend startup and docs":
        "fix: 统一后端启动方式与文档",
    "feat: bootstrap agent backlog and refresh console shell":
        "feat: 初始化 agent backlog 并刷新控制台外壳",
    "Fix SPA route fallback for config pages":
        "修复配置页的 SPA 路由回退",
    "Restructure lake console navigation and branding":
        "重组湖控制台导航与品牌标识",
    "Rename project to multimodal data lake":
        "项目重命名为多模态数据湖",
    "feat: add centralized config center":
        "feat: 新增集中化配置中心",
    "feat: complete platform status dashboard enhancements":
        "feat: 完成平台状态仪表盘增强",
    "build: update dist for platform status dashboard":
        "build: 更新 dist（平台状态仪表盘）",
    "feat: enrich platform status dashboard interactions":
        "feat: 丰富平台状态仪表盘交互",
    "feat: integrate platform component status into dashboard":
        "feat: 把平台组件状态接入仪表盘",
    "build: update dist for compact overview":
        "build: 更新 dist（紧凑总览）",
    "feat: compact platform overview with segmented views":
        "feat: 平台总览紧凑化、分段视图",
    "feat: add pagination to task governance list":
        "feat: 任务治理列表新增分页",
    "build: update dist artifacts for orchestration split":
        "build: 更新 dist（编排拆分）",
    "feat: split workflow into dedicated orchestration center":
        "feat: 工作流拆分为独立的编排中心",
    "feat: split task governance into dedicated page":
        "feat: 任务治理拆分为独立页面",
    "feat: restructure ai workbench into segmented control plane":
        "feat: AI 工作台重构为分段控制面",
    "feat: checkpoint platform and frontend overhaul":
        "feat: 平台与前端大改的检查点",
}

msg = sys.stdin.buffer.read().decode("utf-8", errors="replace")
first_line, _, rest = msg.partition("\n")
first_line = first_line.rstrip("\r")
if first_line in MAPPING:
    first_line = MAPPING[first_line]
if rest:
    out = first_line + "\n" + rest
else:
    out = first_line + "\n"
sys.stdout.buffer.write(out.encode("utf-8"))
