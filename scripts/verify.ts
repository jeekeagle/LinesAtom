import assert from 'node:assert/strict';
import { loadSeedProject } from '../server/seed';
import { normalizeSkills, DEFAULT_SKILLS } from '../server/skills';
import { DEFAULT_SETTINGS } from '../server/seed';
import { runLecturePipeline } from '../server/lecture';
import { validateProject } from '../server/validate';

let failures = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}

const SAMPLE = `# 为什么同一套预算会同时买三个时代
信息化是让事实被记录下来的阶段。记录权决定了事实以什么方式进入系统。
数字化是让系统直接产出结论的阶段。判断权开始从人手里移走。
智能化的定义是把行动交给系统自主执行。行动权由此迁移。

## 一个真实场景
一家制造企业在同一张申报表上并列信息化运维、数字化平台、智能化试点，三个条目分属不同预算池。
2025 年的行业研究显示，15.6% 的制造企业把数据孤岛与系统集成列为转型中最大的需求。
如果三个时代真是一条升级路线，跳级为什么这么常见？

## 判断与代价
数据孤岛是有数据但对不上，缺的是管道。隐性经验是判断从未被表达，缺的是内容。
老师傅离职后判断规则没有留下，直接消失，这就是隐性经验。
补法不同是因为缺的东西不同，买系统能修管道，不能凭空生产内容。
所以先问自己缺的是连接还是知识，再决定投入方向。

## 收束
判断一个组织有没有真正上台阶，不看用了多少 Agent，先看行动权有没有可靠落点。
数据可读、流程可复述、异常有规则，三项缺一，智能就只是更贵的接口。`;

console.log('\n[1] 种子讲稿验收');
const seed = loadSeedProject();
const seedReport = validateProject(seed);
seedReport.checks.forEach((item) => {
  check(`${item.title}：${item.value}`, () => {
    assert.equal(item.pass, true, `${item.title} 未通过：${item.evidence}`);
  });
});

console.log('\n[2] 流水线生成');
const skills = normalizeSkills(DEFAULT_SKILLS);
const result = await runLecturePipeline(
  {
    topic: '为什么同一套预算会同时买三个时代',
    material: SAMPLE,
    mode: 'script',
    durationMinutes: 12,
    charsPerMinute: 112,
    cognitiveLoadCap: 8,
    blockTargetChars: 90,
    questionRatioFloor: 0.08
  },
  skills,
  DEFAULT_SETTINGS
);

check('产出讲稿块', () => {
  assert.ok(result.project.blocks.length >= 6, `块数过少：${result.project.blocks.length}`);
});

check('无未标注块', () => {
  const unlabeled = result.project.blocks.filter((block) => !block.label);
  assert.equal(unlabeled.length, 0, `未标注块：${unlabeled.map((b) => b.id).join('、')}`);
});

check('核心概念不超过认知负荷上限', () => {
  const core = result.project.blocks.filter((block) => block.label === 'core').length;
  assert.ok(core <= 8, `核心概念 ${core} 超过上限 8`);
});

check('每个核心概念锚点都有卡片指针', () => {
  result.project.concepts.forEach((concept) => {
    const pointer = result.project.pointers.find(
      (item) => item.mediaType === 'concept' && item.targetId === concept.id
    );
    assert.ok(pointer, `概念 ${concept.name} 缺少卡片指针`);
    assert.equal(pointer!.blockId, concept.anchorBlockId, `概念 ${concept.name} 指针不在锚点`);
  });
});

check('回指只落在后续块且块内确有该术语', () => {
  result.project.concepts.forEach((concept) => {
    concept.recurrences.forEach((blockId) => {
      const block = result.project.blocks.find((item) => item.id === blockId);
      assert.ok(block, `回指块不存在：${blockId}`);
      assert.ok(block!.text.includes(concept.name), `回指块未出现术语：${concept.name}`);
      assert.notEqual(blockId, concept.anchorBlockId, '回指不应等于锚点');
    });
  });
});

check('挂载指针无重复且目标可解析', () => {
  const seen = new Set<string>();
  result.project.pointers.forEach((pointer) => {
    const key = `${pointer.blockId}:${pointer.mediaType}:${pointer.targetId}`;
    assert.ok(!seen.has(key), `重复挂载：${key}`);
    seen.add(key);
    if (pointer.mediaType === 'concept') {
      assert.ok(
        result.project.concepts.some((concept) => concept.id === pointer.targetId),
        `概念目标缺失：${pointer.targetId}`
      );
    }
  });
});

check('过渡衔接不挂载', () => {
  result.project.blocks
    .filter((block) => block.label === 'transition')
    .forEach((block) => {
      assert.equal(
        result.project.pointers.filter((pointer) => pointer.blockId === block.id).length,
        0,
        `过渡块 ${block.id} 不应有挂载`
      );
    });
});

check('生成的介质数量与挂载一致', () => {
  const byType = (type: string) =>
    result.project.pointers.filter((pointer) => pointer.mediaType === type).length;
  assert.equal(result.project.media.cases.length, byType('case'));
  assert.equal(result.project.media.qas.length, byType('qa'));
  assert.equal(result.project.media.cheatsheets.length, byType('cheatsheet'));
  assert.equal(result.project.media.slides.length + result.project.media.maps.length, byType('slide') + byType('map'));
});

check('生成项目验收通过（时长与占比容差内）', () => {
  const report = validateProject(result.project);
  const mustPass = report.checks.filter((item) =>
    ['label-completeness', 'concept-coverage', 'jump-integrity', 'cognitive-load'].includes(item.id)
  );
  mustPass.forEach((item) => assert.equal(item.pass, true, `${item.title} 未通过：${item.evidence}`));
});

check('流水线留下可读警告', () => {
  assert.ok(Array.isArray(result.warnings), '缺少 warnings 字段');
});

console.log('\n[3] 停用技能会改变产物');
const disabled = normalizeSkills(
  DEFAULT_SKILLS.map((skill) =>
    skill.id === 'case-study' ? { ...skill, enabled: false } : skill
  )
);
const disabledResult = await runLecturePipeline(
  {
    topic: '停用案例技能',
    material: SAMPLE,
    mode: 'script',
    durationMinutes: 12,
    charsPerMinute: 112,
    cognitiveLoadCap: 8,
    blockTargetChars: 90,
    questionRatioFloor: 0.08
  },
  disabled,
  DEFAULT_SETTINGS
);
check('案例技能停用后不再产出案例', () => {
  assert.equal(disabledResult.project.media.cases.length, 0);
  assert.equal(
    disabledResult.project.pointers.filter((pointer) => pointer.mediaType === 'case').length,
    0
  );
  const exampleBlocks = disabledResult.project.blocks.filter((block) => block.label === 'example').length;
  if (exampleBlocks > 0) {
    assert.ok(
      disabledResult.warnings.some((warning) => warning.includes('案例技能')),
      '缺少停用警告'
    );
  }
});

console.log(`\n生成样本：${result.project.blocks.length} 块 / ${result.project.concepts.length} 概念 / ${result.project.pointers.length} 挂载`);
console.log(failures === 0 ? '\n全部通过。\n' : `\n${failures} 项未通过。\n`);
process.exit(failures === 0 ? 0 : 1);