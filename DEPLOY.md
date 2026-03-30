# Kongzhi 部署指南

## 1. 服务端部署 (已完成)

服务端组件已通过 Docker 容器启动：
- **控制面 (Control Plane)**: `http://192.168.10.152:8081`
- **数据库 (PostgreSQL)**: 运行中 (端口 5432)
- **PowerDNS**: (由于网络镜像源问题暂未启动，DNS 更新功能暂不可用，但不影响控制台访问)

### 管理命令
```bash
# 查看日志
docker logs -f kongzhi-control

# 重启服务
docker restart kongzhi-control
```

## 2. 客户端 (Agent) 安装

客户端程序 `agent` 已编译完成，位于 `bin/agent`。

### 安装步骤 (在目标机器上)
1. 将 `bin/agent` 和 `scripts/install_agent.sh` 复制到目标机器。
2. 运行安装脚本：
   ```bash
   chmod +x install_agent.sh
   sudo ./install_agent.sh
   ```

### 验证
```bash
systemctl status kongzhi-agent
```
