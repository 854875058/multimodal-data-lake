# -*- coding: utf-8 -*-
"""诊断脚本：检查 LanceDB 表结构和数据"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.core.models_loader import get_lancedb_tables

def diagnose():
    print("=" * 60)
    print("LanceDB 数据诊断")
    print("=" * 60)

    try:
        tbl_text, tbl_image, tbl_files = get_lancedb_tables()

        # 1. 检查表结构
        print("\n【1】表结构检查")
        print("-" * 60)
        print(f"text_chunks 表 schema: {tbl_text.schema}")
        print(f"image_chunks 表 schema: {tbl_image.schema}")
        print(f"files 表 schema: {tbl_files.schema}")

        # 2. 检查记录数
        print("\n【2】记录数统计")
        print("-" * 60)
        try:
            text_count = tbl_text.count_rows()
            print(f"text_chunks 表记录数: {text_count}")
        except Exception as e:
            print(f"text_chunks 表记录数获取失败: {e}")
            text_count = 0

        try:
            image_count = tbl_image.count_rows()
            print(f"image_chunks 表记录数: {image_count}")
        except Exception as e:
            print(f"image_chunks 表记录数获取失败: {e}")
            image_count = 0

        try:
            files_count = tbl_files.count_rows()
            print(f"files 表记录数: {files_count}")
        except Exception as e:
            print(f"files 表记录数获取失败: {e}")
            files_count = 0

        # 3. 检查 files 表的数据样本
        if files_count > 0:
            print("\n【3】files 表数据样本（前3条）")
            print("-" * 60)
            try:
                df = tbl_files.to_pandas()
                print(f"总记录数: {len(df)}")
                print(f"列名: {df.columns.tolist()}")

                for idx, row in df.head(3).iterrows():
                    print(f"\n记录 {idx + 1}:")
                    print(f"  file_hash: {row.get('file_hash', 'N/A')}")
                    print(f"  doc_name: {row.get('doc_name', 'N/A')}")
                    print(f"  doc_type: {row.get('doc_type', 'N/A')}")
                    print(f"  source_uri: {row.get('source_uri', 'N/A')}")

                    file_bytes = row.get('file_bytes')
                    if file_bytes is not None:
                        print(f"  file_bytes: 存在 ({len(file_bytes)} bytes)")
                    else:
                        print(f"  file_bytes: None (未存储原始文件！)")

                    text_full = row.get('text_full', '')
                    if text_full:
                        print(f"  text_full: 存在 ({len(text_full)} 字符)")
                    else:
                        print(f"  text_full: 空")

            except Exception as e:
                print(f"读取 files 表失败: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("\n【3】files 表为空，没有数据")

        # 4. 检查 text_chunks 表的数据样本
        if text_count > 0:
            print("\n【4】text_chunks 表数据样本（前3条）")
            print("-" * 60)
            try:
                df = tbl_text.to_pandas()
                print(f"总记录数: {len(df)}")
                print(f"列名: {df.columns.tolist()}")

                for idx, row in df.head(3).iterrows():
                    print(f"\n记录 {idx + 1}:")
                    print(f"  id: {row.get('id', 'N/A')}")
                    print(f"  doc_name: {row.get('doc_name', 'N/A')}")
                    print(f"  doc_type: {row.get('doc_type', 'N/A')}")
                    print(f"  file_hash: {row.get('file_hash', 'N/A')}")
                    print(f"  source_uri: {row.get('source_uri', 'N/A')}")
                    text = row.get('text', '')
                    print(f"  text: {text[:100]}..." if len(text) > 100 else f"  text: {text}")

            except Exception as e:
                print(f"读取 text_chunks 表失败: {e}")
                import traceback
                traceback.print_exc()

        # 5. 检查 file_hash 一致性
        print("\n【5】file_hash 一致性检查")
        print("-" * 60)
        try:
            if text_count > 0 and files_count > 0:
                text_df = tbl_text.to_pandas()
                files_df = tbl_files.to_pandas()

                text_hashes = set(text_df['file_hash'].unique())
                files_hashes = set(files_df['file_hash'].unique())

                print(f"text_chunks 表中唯一 file_hash 数: {len(text_hashes)}")
                print(f"files 表中唯一 file_hash 数: {len(files_hashes)}")

                missing = text_hashes - files_hashes
                if missing:
                    print(f"\n⚠️ 警告：text_chunks 中有 {len(missing)} 个 file_hash 在 files 表中不存在！")
                    print(f"缺失的 file_hash（前5个）: {list(missing)[:5]}")
                else:
                    print("✅ 所有 text_chunks 的 file_hash 都能在 files 表中找到")
            else:
                print("跳过（表为空）")

        except Exception as e:
            print(f"一致性检查失败: {e}")
            import traceback
            traceback.print_exc()

        print("\n" + "=" * 60)
        print("诊断完成")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ 诊断失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    diagnose()
