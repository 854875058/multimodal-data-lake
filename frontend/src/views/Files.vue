<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">文件管理</h1>
      <p class="page-subtitle">查看、预览和管理已上传的文件</p>
    </div>

    <div class="glass-card" style="margin-bottom: 1rem;">
      <el-row :gutter="16" align="middle">
        <el-col :span="6">
          <el-select v-model="filterType" placeholder="文件类型" @change="loadFiles">
            <el-option label="全部类型" value="all" />
            <el-option label="文本文件" value="txt" />
            <el-option label="PDF" value="pdf" />
            <el-option label="Word" value="docx" />
            <el-option label="图片" value="jpg" />
            <el-option label="音频" value="mp3" />
            <el-option label="视频" value="mp4" />
          </el-select>
        </el-col>
        <el-col :span="18" style="text-align: right;">
          <el-button type="primary" :icon="Refresh" @click="loadFiles">刷新</el-button>
        </el-col>
      </el-row>
    </div>

    <div v-loading="loading">
      <div v-if="files.length > 0">
        <el-table :data="files" stripe style="width: 100%;" class="glass-card">
          <el-table-column prop="doc_name" label="文件名" min-width="200" />
          <el-table-column prop="doc_type" label="类型" width="100">
            <template #default="{ row }">
              <el-tag size="small">{{ row.doc_type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="source_uri" label="存储位置" min-width="250" show-overflow-tooltip />
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="previewFile(row)">预览</el-button>
              <el-button size="small" type="danger" @click="deleteFile(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadFiles"
          @size-change="loadFiles"
          style="margin-top: 1rem; justify-content: center;"
        />
      </div>

      <el-empty v-else description="暂无文件" :image-size="150" />
    </div>

    <!-- 预览对话框 -->
    <el-dialog v-model="previewVisible" :title="previewTitle" width="70%" :close-on-click-modal="false" @closed="onPreviewClosed">
      <div v-loading="previewLoading">
        <!-- 图片预览 -->
        <div v-if="previewType === 'image'" style="text-align: center;">
          <img :src="previewMediaUrl" style="max-width: 100%; max-height: 600px;" />
        </div>

        <!-- 音频预览 -->
        <div v-else-if="previewType === 'audio'" style="text-align: center;">
          <audio controls style="width: 100%;">
            <source :src="previewMediaUrl" />
          </audio>
        </div>

        <!-- 视频预览 -->
        <div v-else-if="previewType === 'video'" style="text-align: center;">
          <video controls style="max-width: 100%; max-height: 600px;">
            <source :src="previewMediaUrl" />
          </video>
        </div>

        <!-- 文本预览 -->
        <div v-else-if="previewType === 'text'">
          <el-input
            v-model="previewTextFull"
            type="textarea"
            :rows="20"
            readonly
            style="font-family: monospace;"
          />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

const loading = ref(false)
const files = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const filterType = ref('all')

const previewVisible = ref(false)
const previewLoading = ref(false)
const previewTitle = ref('')
const previewType = ref('')
const previewExt = ref('')
const previewMediaUrl = ref('')
const previewTextFull = ref('')

const onPreviewClosed = () => {
  previewType.value = ''
  previewExt.value = ''
  previewMediaUrl.value = ''
  previewTextFull.value = ''
}

const loadFiles = async () => {
  loading.value = true
  try {
    const response = await api.getFiles(
      currentPage.value,
      pageSize.value,
      filterType.value === 'all' ? null : filterType.value
    )

    if (response.success) {
      files.value = response.files
      total.value = response.total
    }
  } catch (error) {
    console.error('加载文件列表失败:', error)
    ElMessage.error('加载文件列表失败')
  } finally {
    loading.value = false
  }
}

const previewFile = async (file) => {
  previewVisible.value = true
  previewLoading.value = true
  previewTitle.value = file.doc_name
  previewType.value = ''
  previewExt.value = ''
  previewMediaUrl.value = ''
  previewTextFull.value = ''

  try {
    const response = await api.previewFile(file.file_hash)

    if (response.success) {
      previewType.value = response.content_type
      previewExt.value = response.doc_type

      if (response.content_type === 'text') {
        previewTextFull.value = response.text_full || '无文本内容'
      } else {
        previewMediaUrl.value = response.content_url || api.getFileContentUrl(file.file_hash)
      }
    } else {
      ElMessage.error('预览失败')
      previewVisible.value = false
    }
  } catch (error) {
    console.error('预览失败:', error)
    ElMessage.error('预览失败')
    previewVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

const deleteFile = async (file) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除文件 "${file.doc_name}" 吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const response = await api.deleteFile(file.file_hash)

    if (response.success) {
      ElMessage.success('文件删除成功')
      loadFiles()
    } else {
      ElMessage.error(response.message || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  loadFiles()
})
</script>

<style scoped>
.el-table {
  background: transparent;
}
</style>
