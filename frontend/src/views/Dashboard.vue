<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">领导看板</h1>
      <p class="page-subtitle">实时查看数据接入、系统运行和知识图谱概览</p>
    </div>

    <el-button type="primary" :icon="Refresh" @click="loadData" style="margin-bottom: 1rem;">
      刷新数据
    </el-button>

    <div class="section-title">核心指标</div>
    <el-row :gutter="16" style="margin-bottom: 2rem;">
      <el-col :span="4" v-for="kpi in kpis" :key="kpi.label">
        <div class="kpi-card">
          <div class="kpi-label">{{ kpi.label }}</div>
          <div class="kpi-value">{{ kpi.value }}</div>
          <div class="kpi-sub" v-if="kpi.sub">{{ kpi.sub }}</div>
        </div>
      </el-col>
    </el-row>

    <div class="section-title">任务健康度</div>
    <el-row :gutter="16" style="margin-bottom: 2rem;">
      <el-col :span="8" v-for="health in healthKpis" :key="health.label">
        <div class="kpi-card">
          <div class="kpi-label">{{ health.label }}</div>
          <div class="kpi-value">{{ health.value }}</div>
          <div class="kpi-sub" v-if="health.sub">{{ health.sub }}</div>
        </div>
      </el-col>
    </el-row>

    <div class="section-title">近 7 天接入趋势</div>
    <div class="glass-card" style="margin-bottom: 2rem;">
      <div v-if="trendData.length > 0">
        <div ref="trendChart" style="width: 100%; height: 300px;"></div>
      </div>
      <el-empty v-else description="暂无近 7 天任务数据" :image-size="100" />
    </div>

    <div class="section-title">存量文件类型分布</div>
    <div class="glass-card" style="margin-bottom: 2rem;">
      <div v-if="fileTypes.length > 0">
        <div ref="typeChart" style="width: 100%; height: 300px;"></div>
      </div>
      <el-empty v-else description="暂无文件类型分布数据" :image-size="100" />
    </div>

    <div class="section-title">文件知识图谱</div>
    <div class="glass-card" style="margin-bottom: 2rem;">
      <div v-if="knowledgeGraph.nodes.length > 0">
        <div v-if="knowledgeGraph.message" class="graph-tip">
          {{ knowledgeGraph.message }}
        </div>
        <div ref="graphChart" style="width: 100%; height: 420px;"></div>
      </div>
      <el-empty
        v-else
        :description="knowledgeGraph.message || '暂无知识图谱数据'"
        :image-size="100"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { use, init } from 'echarts/core'
import { LineChart, BarChart, GraphChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import api from '@/api'

use([LineChart, BarChart, GraphChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer])

const kpis = ref([])
const healthKpis = ref([])
const trendData = ref([])
const fileTypes = ref([])
const knowledgeGraph = ref({
  nodes: [],
  links: [],
  categories: [],
  mode: '',
  message: ''
})

const trendChart = ref(null)
const typeChart = ref(null)
const graphChart = ref(null)

let trendChartInstance = null
let typeChartInstance = null
let graphChartInstance = null

const handleResize = () => {
  trendChartInstance?.resize()
  typeChartInstance?.resize()
  graphChartInstance?.resize()
}

const loadData = async () => {
  try {
    const [stats, trend, types, graph] = await Promise.all([
      api.getDashboardStats(),
      api.getTrend(7),
      api.getFileTypes(),
      api.getKnowledgeGraph()
    ])

    kpis.value = [
      { label: '文本/语音切片', value: Number(stats.text_rows || 0).toLocaleString(), sub: 'LanceDB 文本表' },
      { label: '视觉索引', value: Number(stats.image_rows || 0).toLocaleString(), sub: 'LanceDB 图像表' },
      { label: '文件总量', value: Number(stats.total_files || 0).toLocaleString(), sub: '已注册文件数' },
      { label: '今日接入', value: Number(stats.today_files || 0).toLocaleString(), sub: '当日新增' },
      { label: '本周接入', value: Number(stats.week_files || 0).toLocaleString(), sub: '近 7 天' }
    ]

    healthKpis.value = [
      { label: '本周任务成功率', value: `${stats.week_success_rate}%`, sub: '近 7 天统计' },
      { label: '本周处理条数', value: Number(stats.week_tasks_success || 0).toLocaleString(), sub: `共 ${Number(stats.week_tasks_total || 0).toLocaleString()} 个任务` },
      { label: '平均耗时', value: `${stats.week_avg_time_sec}s`, sub: '近 7 天任务' }
    ]

    trendData.value = trend || []
    fileTypes.value = types || []
    knowledgeGraph.value = graph || { nodes: [], links: [], categories: [], mode: '', message: '' }

    await nextTick()
    renderTrendChart()
    renderTypeChart()
    renderKnowledgeGraph()
  } catch (error) {
    console.error('加载数据失败:', error)
  }
}

const renderTrendChart = () => {
  if (!trendChart.value || trendData.value.length === 0) return

  if (!trendChartInstance) {
    trendChartInstance = init(trendChart.value)
  }

  trendChartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>成功处理: {c} 个文件'
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: trendData.value.map((item) => item.date),
      boundaryGap: false,
      axisLabel: { rotate: 30, fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      name: '文件数',
      minInterval: 1,
      axisLabel: { fontSize: 11 }
    },
    series: [{
      name: '成功处理',
      data: trendData.value.map((item) => item.success_count),
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      areaStyle: { color: 'rgba(37,99,235,0.10)' },
      lineStyle: { color: '#2563eb', width: 3 },
      itemStyle: { color: '#2563eb' }
    }]
  })
}

const renderTypeChart = () => {
  if (!typeChart.value || fileTypes.value.length === 0) return

  if (!typeChartInstance) {
    typeChartInstance = init(typeChart.value)
  }

  typeChartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: '{b}<br/>文件数: {c}'
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: fileTypes.value.map((item) => item.doc_type),
      axisLabel: { fontSize: 11, interval: 0 }
    },
    yAxis: {
      type: 'value',
      name: '文件数',
      minInterval: 1,
      axisLabel: { fontSize: 11 }
    },
    series: [{
      name: '文件数量',
      data: fileTypes.value.map((item) => item.count),
      type: 'bar',
      barWidth: '50%',
      itemStyle: {
        color: '#3b82f6',
        borderRadius: [6, 6, 0, 0]
      },
      label: {
        show: true,
        position: 'top',
        fontSize: 12,
        fontWeight: 'bold',
        color: '#1e3a5f'
      }
    }]
  })
}

const renderKnowledgeGraph = () => {
  if (!graphChart.value) return

  if (!knowledgeGraph.value.nodes.length) {
    graphChartInstance?.clear()
    return
  }

  if (!graphChartInstance) {
    graphChartInstance = init(graphChart.value)
  }

  graphChartInstance.setOption({
    tooltip: {
      formatter(params) {
        if (params.dataType === 'edge') {
          const score = params.data?.value ? `<br/>相似度: ${params.data.value}` : ''
          return `${params.data.source} → ${params.data.target}${score}`
        }

        const categoryName = knowledgeGraph.value.categories?.[params.data.category]?.name
        const value = params.data?.value ? `<br/>类型: ${params.data.value}` : ''
        return `${params.data.name}${categoryName ? `<br/>分类: ${categoryName}` : ''}${value}`
      }
    },
    legend: knowledgeGraph.value.categories?.length
      ? [{ data: knowledgeGraph.value.categories.map((item) => item.name) }]
      : [],
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      label: { show: true, fontSize: 10 },
      force: { repulsion: 220, edgeLength: [70, 160] },
      categories: knowledgeGraph.value.categories || [],
      data: knowledgeGraph.value.nodes || [],
      links: knowledgeGraph.value.links || [],
      lineStyle: { color: '#93c5fd', curveness: 0.1, opacity: 0.9 },
      emphasis: { focus: 'adjacency' }
    }]
  })
}

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  trendChartInstance?.dispose()
  typeChartInstance?.dispose()
  graphChartInstance?.dispose()
  trendChartInstance = null
  typeChartInstance = null
  graphChartInstance = null
})
</script>

<style scoped>
.graph-tip {
  margin-bottom: 0.75rem;
  color: #64748b;
  font-size: 0.9rem;
}
</style>
