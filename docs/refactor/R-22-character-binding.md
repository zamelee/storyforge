# R-22 �� ��ɫ��������(�½�/ϸ��/����ϸ��)

> **״̬**: ? ��� �� ����Զ��
> **Commit**: `b47cca1`(��������Զ�� 0,��ͬ��)
> **��Χ**: �¸����ɡ�ϸ�����ɡ�����ϸ�١�����ϸ������ǿϸ�� �� 5 �� LLM ���
> **ǰ��**: R-19 CORE ���� �� R-15 ��ɫ binding �� R-20 ������ binding

---

## ?? ���񱳾�

R-19 �Ѿ���"����"��"������"������Ŀ��ɫ��(����:�Ͻ�ƾ����������),��**�½ڼ���**�� prompt ©��:
- �¸�(`outline-adapter`)
- ϸ��(`chapter-adapter`)
- ����ϸ��(`batchGenerateDetails`)
- ����ϸ��(`buildDetailSceneGeneratePrompt`)
- ��ǿϸ��(`buildEnhancedDetailPrompt`)

���� LLM �������½�����ʱ,**�����Զ����"������/������/�����/������"** ����**�������û��**������(�û������ɫ��������/������/����/����ͥ)��

---

## ?? �������

R-22 ֮ǰ,`DetailedOutlinePanel.tsx` ��������д��ɫ��:

```ts
// ? �ɴ���:ֻ���� main ��ɫ
const charCtx = characters
  .filter(c => c.roleWeight === 'main')  // �� ֻȡ����
  .map(c => `[ID:${c.id}] ${c.name}��${c.orderAxis}/${c.moralAxis}��`)
  .join('\n')
```

**3 ������**:
1. **ֻ���� main** �� secondary/npc ȫ����ʧ,LLM ���������ɳ���
2. **��ʽ��ª** �� ֻ��"����(��Ӫ)",**û�м��/��ϵ**,LLM ��֪�������ɫ��˭
3. **�� assemble-context ˫��** �� ���� 5 ������� 2 ������д path,3 ���� assembled path,��һ��

**assemble-context ���**:
- ��ɫ��ȷʵ�� prompt ��(R-15 �Ĺ�)
- ��**�� trim ʱ���ַ�������һ����** �� 14 ����ɫ���̫��,���ص�ֻʣ 1-2 ������,LLM �ֿ�ʼ��

---

## ?? �޸�����(4 ���Ķ�)

### �Ķ� 1: `src/lib/registry/assemble-context.ts` �� CORE ���� + ���ֱ���

```ts
function extractCharacterNames(content: string): string[] {
  // ʶ�� 4 �� buildCharacterContext �����ʽ:
  // 1. `name(��ɫ��...)`  �� main
  // 2. `name: ����`        �� secondary(����ð��)
  // 3. `name1��name2(����)` �� others(�ٺŷָ�)
  // 4. `- name(...)`       �� �б���
  ...
}

// trimToFit ��� characters �����⴦��
if (item.key === 'characters') {
  const names = extractCharacterNames(item.segment.content)
  if (names.length > 0) {
    const namesHeader = `���Ѵ����Ľ�ɫ �� �����嵥(����Ѳ�)��\n${names.join(' / ')}\n\n`
    const remainingBudget = approxChars - namesHeader.length
    if (remainingBudget > 40) {
      item.segment.content = namesHeader + item.segment.content.slice(0, remainingBudget) + '\n...(����ѽض�,�������־�Ϊ���ý�ɫ)'
    } else {
      item.segment.content = namesHeader
    }
  }
}
```

**Ч��**: ��ɫ�α� trim ʱ,**������Զ����**;���ɲá�

### �Ķ� 2: `src/components/outline/DetailedOutlinePanel.tsx` �� 2 �� charCtx

```ts
// ? ��:ֻ���� main
const charCtx = characters.filter(c => c.roleWeight === 'main').map(...).join('\n')

// ? ��:�� assembled ��(�� CORE ���� + ���ֱ���)
const { worldContext: worldCtx, characterContext: charCtx } = await buildDetailContext(currentChapter.id!)
// batchDetail �Ǳ��� baseCtx.segments[characters]
```

**5 �� LLM �������ȫ���� assembled**,��Ϊһ��:
- handleAIGenerate(����ϸ��) �� `ctx.characterContext`
- handleEnhancedGenerate(��ǿϸ��) �� `ctx.characterContext`
- handleBatchDetail(����ϸ��) �� `baseCtx.segments[characters]`

### �Ķ� 3: `src/lib/ai/prompt-seeds.ts` �� �½� SYSTEM ��ƪ������

```ts
// CHAPTER_SYSTEM ĩβ׷��
'**ƪ������**: �û�ָ�� ${wordCount} ��ʱ,���ı���ﵽ������ ��10%��\n' +
'2500 �ֵ��½�д 1800 �� = �����;5000 ���½�д 3500 �� = ����ꡣ\n' +
'��Ҫ��"����ʡ��""����"�ȷ�ʽѹ��ƪ��,�����½ڿ��Ա���������ϸ�¡�'
```

**chapter.content userPromptTemplate** ĩβ��:
```ts
'��д��Ŀ������(Լ ${wordCount} ��)'
```

### �Ķ� 4: `tests/regression/R-22-chapter-character-binding.test.ts` �� 4 ���ع�����

- `extractCharacterNames 4 �ָ�ʽ`
- `trimToFit �����ֲ���`
- `chapter prompt ������ɫ��(�� assembled)`
- `batch detail prompt ������ɫ��`

---

## ? ��֤���

| ��Ŀ | ��� |
|---|---|
| `tsc --noEmit` | 0 errors |
| `vitest run` | **300/300** passed(72 test files) |
| `generate-ai-manual.mjs` | ok, generated |
| `generate-ai-manual.mjs --check` | ok, matches code |
| `check-architecture.mjs` | ? �޷�ģʽΥ�� |
| `check-required-tables.mjs` | ok, 40 tables match schema.ts |
| ʵ�� LLM ����(�� 1 �¡����ݾ��衷) | 2670/2500 �� �� **��ɫ��ȫ��,��������** |

---

## ?? �û��ӽ��޸�Ч��

| ֮ǰ | ���� |
|---|---|
| LLM ���"������/������" | LLM �������ò������ɷ��ӿռ�,ֻ�ܴ� 14 ���������� |
| �½����� 1800/2500 | �½����� 2400~2700/2500 |
| 5 �� LLM �����Ϊ��һ�� | 5 �� LLM ���ȫ���� assembled,��Ϊͳһ |
| ������Ϣ(���Ͽع�Ȩ֮��)���ڡ����º��ġ�,�о�͸���� | ͬ����� prompt,�� LLM ��ȷʶ��Ϊ"δ������"����͸(R-20 ��֤) |

---

## ?? ��֪���� & δ������

1. **�û�������**: ��ɫ�����и����ֽ� `"����"`(�ֶ������󵱽�ɫ��),role �� main
   - �޸�·��: �ڽ�ɫ����ҳɾ��(�û��ֶ�)
   - �Ƿ�Ҫ�Զ�����: **����**,�Զ�����������ɾ�û�������
2. **genre �ֶ�**: ��Ŀ�� genre=`"qingxiaoshuo"`(��С˵),��ʵ��д��������
   - Ӱ��: prompt �����������������
   - �޸�: �û�����Ŀ���ø� genre
3. **������Ϣ���ڡ����º��ġ�**: ���������� user ��
   - ����: model ������ʱ���ܾ�͸
   - ����: �´� R-23 �� UI ����ʱ,��"����"Ų�������� source key

---

## ?? �Ķ��ļ��嵥

```
M  docs/AI-FUNCTIONS-MANUAL.generated.md          (auto)
M  src/components/outline/DetailedOutlinePanel.tsx (2 �� charCtx)
M  src/lib/registry/assemble-context.ts            (trimToFit + extractCharacterNames)
A  tests/regression/R-22-chapter-character-binding.test.ts (4 cases)
```

---

## ?? ���� PR / �ĵ�

- R-19: `tests/regression/R-19-assemble-context-core-trim-guard.test.ts`(CORE ����)
- R-15: `tests/regression/R-15-outline-character-binding.test.ts`(���� binding)
- R-20: `tests/regression/R-20-story-arc-character-binding.test.ts`(������ binding)
- R-21: `tests/regression/R-21-llm-monitor.test.ts`(LLM ���̽��)

---

**������**: 2026-06-24 �� by Codex
