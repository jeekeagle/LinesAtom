@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo [讲义轴] 正在安装依赖...
  call npm install
)
if not exist dist (
  echo [讲义轴] 正在构建前端...
  call npm run build
)
echo [讲义轴] 启动中：http://127.0.0.1:8790
start "" http://127.0.0.1:8790
call npm start