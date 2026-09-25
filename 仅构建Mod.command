#!/bin/zsh
set -e
cd "${0:A:h}"
uv run main.py build
echo ""
echo "构建完成，结果位于 results 文件夹。"
read "? 按回车键关闭窗口。"
