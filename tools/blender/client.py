"""
client.py — 直接走 TCP 跟 Blender MCP addon 通信 (bypass MCP server wrapper)
addon 在 Blender 进程内监听 localhost:9876, 协议是 JSON line

用法 (单条命令):
  python client.py get_scene_info
  python client.py execute_code "import bpy; print(bpy.data.objects.keys())"

或者 import 进其他脚本用 BlenderClient 类
"""
from __future__ import annotations

import json
import socket
import sys
from typing import Any

HOST = "localhost"
PORT = 9876
BUFFER = 4096


def send_command(cmd_type: str, params: dict[str, Any] | None = None, *, timeout: float = 600.0) -> dict:
    """发一条命令, 返回 dict (status/result 或 status/message)"""
    cmd = {"type": cmd_type, "params": params or {}}
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((HOST, PORT))
        s.sendall(json.dumps(cmd).encode("utf-8"))
        chunks = []
        while True:
            try:
                chunk = s.recv(BUFFER)
            except socket.timeout:
                break
            if not chunk:
                break
            chunks.append(chunk)
            # addon 一次性 send 完, 看到完整 JSON 后退出
            try:
                full = b"".join(chunks).decode("utf-8")
                json.loads(full)
                return json.loads(full)
            except json.JSONDecodeError:
                continue
        raise RuntimeError("incomplete response from blender")
    finally:
        s.close()


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "execute_code":
        code = sys.argv[2] if len(sys.argv) > 2 else "print('hello from blender')"
        resp = send_command("execute_code", {"code": code})
    elif cmd == "get_scene_info":
        resp = send_command("get_scene_info")
    elif cmd == "get_viewport_screenshot":
        path = sys.argv[2] if len(sys.argv) > 2 else r"D:\AI music radio\apps\pwa\public\preview\_blender_viewport.png"
        resp = send_command("get_viewport_screenshot", {"max_size": 1200, "filepath": path})
    elif cmd == "get_polyhaven_status":
        resp = send_command("get_polyhaven_status")
    else:
        # 通用透传: 第2个参数是 JSON params
        params = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
        resp = send_command(cmd, params)
    print(json.dumps(resp, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
