#!/usr/bin/env node
/**
 * 讲义轴 CLI —— 让 Codex 或任意 Agent 按“读 schema → 查询 → 执行 → 查状态”驱动系统。
 * 所有命令都通过本地 HTTP API 作用于同一份 data/store.json。
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const command = args[0] ?? 'help';
const flags = {};
const positional = [];

for (let index = 1; index < args.length; index += 1) {
  const item = args[index];
  if (item.startsWith('--')) {
    const key = item.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  } else {
    positional.push(item);
  }
}

const baseUrl = String(flags.url || process.env.LECTURE_AXIS_URL || 'http://127.0.0.1:8790').replace(/\/$/, '');
const asJson = Boolean(flags.json);

const print = (value) => {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }
};

async function api(pathname, init) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload?.message || `请求失败（${response.status}）`);
  }
  return payload;
}

const SCHEMA = {
  product: '讲义轴 · 结构化讲稿系统',
  version: '0.1.0',
  server: baseUrl,
  commands: [
    {
      name: 'doctor',
      description: '检查运行环境：Node 版本、数据目录可写、服务是否在线。',
      options: []
    },
    {
      name: 'schema',
      description: '输出全部命令与数据契约，供 Agent 读取。',
      options: [{ name: '--json', description: '以 JSON 输出（默认）' }]
    },
    {
      name: 'status',
      description: '查看当前讲稿的块数、概念数、挂载数与最近一次引擎运行。',
      options: [{ name: '--json', description: '以 JSON 输出' }]
    },
    {
      name: 'validate',
      description: '按首版四项验收标准逐项检查并返回证据。',
      options: [{ name: '--json', description: '以 JSON 输出' }]
    },
    {
      name: 'skills',
      description: '列出介质引擎的技能台账。',
      options: [{ name: '--json', description: '以 JSON 输出' }]
    },
    {
      name: 'skill',
      description: '单独执行一个技能。',
      arguments: ['<skillId>'],
      options: [
        { name: '--input', description: '技能输入文本' },
        { name: '--json', description: '以 JSON 输出' }
      ]
    },
    {
      name: 'run',
      description: '运行四段流水线，生成新的讲稿、标注与挂载。',
      options: [
        { name: '--topic', description: '课程主题' },
        { name: '--material-file', description: '讲稿素材文件路径' },
        { name: '--material', description: '直接传入讲稿素材' },
        { name: '--skeleton-file', description: '骨架概念清单文件路径' },
        { name: '--mode', description: 'script | material | skeleton，默认 script' },
        { name: '--duration', description: '目标时长（分钟），默认 28' },
        { name: '--cap', description: '认知负荷上限，默认 14' },
        { name: '--json', description: '以 JSON 输出' }
      ]
    },
    {
      name: 'relabel',
      description: '按现有讲稿重算标注与挂载。',
      options: [{ name: '--json', description: '以 JSON 输出' }]
    },
    {
      name: 'export',
      description: '导出结构化数据。',
      options: [{ name: '--out', description: '输出文件路径' }]
    },
    {
      name: 'reset',
      description: '恢复出厂讲稿。',
      options: [{ name: '--yes', description: '确认执行' }]
    }
  ],
  dataContract: {
    project: {
      meta: '讲稿元信息：时长、字数速度、认知负荷上限、设问占比下限、修订号',
      sections: '章节列表，id 与 blocks.sectionId 对应',
      blocks: '讲稿块：id / order / sectionId / text / label / labelEvidence',
      concepts: '概念条目：id / name / definition / parentId / difference / misconceptions / anchorBlockId / recurrences',
      pointers: '挂载指针：blockId / mediaType / targetId / trigger，只存编号',
      media: '介质内容：cases / qas / cheatsheets / slides / maps，与 concepts 独立维护'
    },
    labels: ['core', 'example', 'question', 'transition', 'global', 'conclusion'],
    mountRules: {
      core: 'concept',
      example: 'case',
      question: 'qa',
      conclusion: 'cheatsheet',
      global: 'slide | map',
      transition: null
    }
  }
};

async function main() {
  switch (command) {
    case 'schema': {
      print(SCHEMA);
      return;
    }
    case 'doctor': {
      const report = {
        node: process.version,
        platform: process.platform,
        baseUrl,
        server: { online: false, detail: '' }
      };
      try {
        const health = await api('/api/health');
        report.server = { online: true, detail: `v${health.version} · ${health.blocks} 块`, health };
      } catch (error) {
        report.server = { online: false, detail: error.message };
      }
      const dataDir = path.resolve(process.cwd(), 'data');
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.accessSync(dataDir, fs.constants.W_OK);
        report.dataDir = { writable: true, path: dataDir };
      } catch (error) {
        report.dataDir = { writable: false, path: dataDir, detail: error.message };
      }
      print(report);
      return;
    }
    case 'status': {
      const data = await api('/api/bootstrap');
      print({
        project: data.project.name,
        revision: data.project.meta.revision,
        blocks: data.project.blocks.length,
        concepts: data.project.concepts.length,
        pointers: data.project.pointers.length,
        media: {
          cases: data.project.media.cases.length,
          qas: data.project.media.qas.length,
          cheatsheets: data.project.media.cheatsheets.length,
          slides: data.project.media.slides.length,
          maps: data.project.media.maps.length
        },
        engineRunId: data.project.meta.engineRunId,
        skillsEnabled: data.skills.filter((skill) => skill.enabled).length,
        validation: data.validation.checks.map((check) => ({
          title: check.title,
          pass: check.pass,
          value: check.value
        }))
      });
      return;
    }
    case 'validate': {
      const data = await api('/api/lecture/validation');
      print(data.validation);
      return;
    }
    case 'skills': {
      const data = await api('/api/skills');
      print(
        data.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          stage: skill.stage,
          enabled: skill.enabled,
          version: skill.version,
          runs: skill.runs
        }))
      );
      return;
    }
    case 'skill': {
      const id = positional[0];
      if (!id) throw new Error('用法：lecture-axis skill <skillId> --input "..."');
      const result = await api(`/api/skills/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({ input: String(flags.input || '') })
      });
      print(result);
      return;
    }
    case 'run': {
      const material = flags['material-file']
        ? fs.readFileSync(String(flags['material-file']), 'utf8')
        : String(flags.material || '');
      if (!material.trim()) throw new Error('用法：lecture-axis run --topic "..." --material-file a.md');
      const result = await api('/api/lecture/run', {
        method: 'POST',
        body: JSON.stringify({
          topic: String(flags.topic || '未命名讲稿'),
          material,
          skeleton: flags['skeleton-file']
            ? fs.readFileSync(String(flags['skeleton-file']), 'utf8')
            : undefined,
          mode: String(flags.mode || 'script'),
          durationMinutes: Number(flags.duration || 28),
          cognitiveLoadCap: Number(flags.cap || 14)
        })
      });
      print({
        blocks: result.project.blocks.length,
        concepts: result.project.concepts.length,
        pointers: result.project.pointers.length,
        warnings: result.warnings,
        validation: result.validation.checks.map((check) => ({
          title: check.title,
          pass: check.pass,
          value: check.value
        }))
      });
      return;
    }
    case 'relabel': {
      const result = await api('/api/lecture/relabel', { method: 'POST', body: JSON.stringify({}) });
      print({
        blocks: result.project.blocks.length,
        pointers: result.project.pointers.length,
        warnings: result.warnings
      });
      return;
    }
    case 'export': {
      const data = await api('/api/bootstrap');
      const target = String(flags.out || `lecture-axis-${data.project.meta.revision}.json`);
      fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
      print(`已导出到 ${path.resolve(target)}`);
      return;
    }
    case 'reset': {
      if (!flags.yes) throw new Error('恢复出厂数据需要 --yes 确认。');
      await api('/api/system/reset', { method: 'POST', body: JSON.stringify({}) });
      print('已恢复出厂状态。');
      return;
    }
    default: {
      print(SCHEMA);
    }
  }
}

main().catch((error) => {
  console.error(`执行失败：${error.message}`);
  console.error('提示：先运行 npm start 启动讲义轴服务。');
  process.exit(1);
});