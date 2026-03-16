# -*- coding: utf-8 -*-
"""Internal CLI for submitting Agent Team requests."""

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from agents.request_store import create_request


def main():
    parser = argparse.ArgumentParser(description='提交内部 Agent Team 需求')
    parser.add_argument('--title', required=True, help='需求标题')
    parser.add_argument('--description', required=True, help='需求描述')
    parser.add_argument('--priority', type=int, default=3, help='优先级，1-5')
    parser.add_argument('--acceptance', default='', help='验收标准')
    args = parser.parse_args()

    workspace_dir = ROOT_DIR / 'agents' / 'workspace'
    request = create_request(
        workspace_dir,
        title=args.title,
        description=args.description,
        priority=args.priority,
        acceptance_criteria=args.acceptance,
    )
    print(f"request_id={request['id']}")
    print(f"status={request['status']}")
    print(f"title={request['title']}")


if __name__ == '__main__':
    main()
