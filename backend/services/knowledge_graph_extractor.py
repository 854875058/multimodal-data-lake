# -*- coding: utf-8 -*-
"""Knowledge graph extraction helpers for entities and relations."""

import json
import logging
import re
import urllib.request
from typing import Iterable, List, Sequence, Tuple

logger = logging.getLogger(__name__)

EntityTuple = Tuple[str, str]
RelationTuple = Tuple[str, str, str]

STOP_ENTITY_NAMES = {
    '我们', '你们', '他们', '她们', '它们', '系统', '平台', '项目', '方案', '能力', '功能', '模块',
    '数据', '文件', '文本', '内容', '用户', '接口', '服务', '模型', '技术', '方法', '问题', '结果',
    '其中', '这个', '那个', '这些', '那些', '当前', '本次', '此次', '上述', '以下', '相关'
}

ORG_SUFFIXES = (
    '公司', '集团', '大学', '学院', '研究院', '研究所', '实验室', '银行', '医院', '委员会', '政府',
    '中心', '平台', '系统', '部门', '团队', '项目组', '事务所', '工作室', '数据中心', '基地'
)

LOCATION_SUFFIXES = ('省', '市', '区', '县', '镇', '乡', '村', '国', '州', '新区', '园区')

COMMON_CITIES = {'中国', '美国', '北京', '上海', '深圳', '广州', '杭州', '成都', '苏州', '南京', '天津', '重庆', '武汉', '西安', '香港', '澳门', '台湾'}
GENERIC_PRODUCT_SUFFIXES = ('平台', '系统', '服务', '模型', '数据库', '引擎', '框架', '工具', '组件', '协议', '集群')
LEADING_NOISE_WORDS = ('在', '于', '由', '与', '和', '及', '并', '并且', '同时', '将', '把', '对', '向', '给', '为', '跟', '同')
TRAILING_NOISE_WORDS = ('等', '方面', '相关', '能力', '模块')
VERB_WORDS = (
    '合作', '协同', '联合', '共建', '协作', '属于', '隶属', '隶属于', '归属', '下设',
    '位于', '部署在', '落地于', '设在', '坐落于', '使用', '采用', '基于', '依赖',
    '连接', '对接', '集成', '打通', '接入', '研发', '开发', '构建', '打造', '建设', '推出', '发布',
    '管理', '负责', '维护', '运营', '主导', '提供', '支撑', '服务于', '赋能'
)

ENTITY_TYPE_ALIASES = {
    'person': '人名',
    '人物': '人名',
    '姓名': '人名',
    'human': '人名',
    'location': '地名',
    'place': '地名',
    '地址': '地名',
    'region': '地名',
    'organization': '组织',
    'organisation': '组织',
    'org': '组织',
    '机构': '组织',
    'company': '组织',
    '技术': '技术术语',
    'tech': '技术术语',
    'technology': '技术术语',
    'term': '技术术语',
    'tool': '技术术语',
    'product': '产品',
    'system': '系统',
    'department': '部门',
    'event': '事件',
    'time': '时间',
}

RELATION_TYPE_ALIASES = {
    '协同': '合作',
    '联合': '合作',
    '共建': '合作',
    '协作': '合作',
    '隶属': '属于',
    '归属': '属于',
    '部署于': '位于',
    '落地于': '位于',
    '设在': '位于',
    '坐落于': '位于',
    '采用': '使用',
    '基于': '使用',
    '依赖': '使用',
    '集成': '连接',
    '对接': '连接',
    '打通': '连接',
    '开发': '研发',
    '构建': '研发',
    '打造': '研发',
    '建设': '研发',
    '推出': '研发',
    '发布': '研发',
    '负责': '管理',
    '维护': '管理',
    '运营': '管理',
    '主导': '管理',
    '支撑': '提供',
    '服务于': '提供',
    '赋能': '提供',
}

SENTENCE_SPLIT_RE = re.compile(r'[。！？!?\n]+')
CLAUSE_SPLIT_RE = re.compile(r'[，,；;]+')
CONNECTOR_SPLIT_RE = re.compile(r'\s*(?:和|以及|及|与|、|/|,|，)\s*')
LATIN_ENTITY_RE = re.compile(r'\b[A-Za-z][A-Za-z0-9_.-]{1,40}\b')
ORG_ENTITY_RE = re.compile(r'(?:(?<=^)|(?<=[，。！？；\s与和及在于由对把将向给为跟同]))([A-Za-z0-9\u4e00-\u9fff]{2,40}(?:公司|集团|大学|学院|研究院|研究所|实验室|银行|医院|委员会|政府|中心|平台|系统|部门|团队|项目组|事务所|工作室|数据中心|基地))(?=$|[，。！？；、\s与和及在于由对把将向给为跟同])')
LOCATION_ENTITY_RE = re.compile(r'(?:(?<=^)|(?<=[，。！？；\s在于到至由从]))((?:中国|美国|北京|上海|深圳|广州|杭州|成都|苏州|南京|天津|重庆|武汉|西安|香港|澳门|台湾|[\u4e00-\u9fff]{2,20}(?:省|市|区|县|镇|乡|村|国|州|新区|园区)))(?=$|[，。！？；、\s与和及在于由对把将向给为跟同])')
PERSON_CONTEXT_RE = re.compile(r'([\u4e00-\u9fff]{2,4})(?:教授|博士|先生|女士|工程师|研究员|主任|经理|负责|管理|维护|运营|主导)')
LATIN_WITH_SUFFIX_RE = re.compile(r'^([A-Za-z][A-Za-z0-9_.-]{1,40})\s*(?:平台|系统|服务|模型|数据库|引擎|框架|工具|组件|协议|集群)?$')


EXPLICIT_RELATION_PATTERNS = [
    ('位于', re.compile(r'^(?P<subject>.+?)(?:部署在|位于|落地于|设在|坐落于)(?P<object>.+)$')),
    ('属于', re.compile(r'^(?P<subject>.+?)(?:属于|隶属于|归属|下设)(?P<object>.+)$')),
    ('使用', re.compile(r'^(?P<subject>.+?)(?:依赖|基于|采用|使用)(?P<object>.+)$')),
    ('连接', re.compile(r'^(?P<subject>.+?)(?:连接|对接|集成|打通|接入)(?P<object>.+)$')),
    ('管理', re.compile(r'^(?P<subject>.+?)(?:负责|管理|维护|运营|主导)(?P<object>.+)$')),
    ('提供', re.compile(r'^(?P<subject>.+?)(?:提供|支撑|服务于|赋能)(?P<object>.+)$')),
    ('研发', re.compile(r'^(?P<subject>.+?)(?:开发|研发|构建|打造|建设|推出|发布)(?P<object>.+)$')),
]

IMPLICIT_RELATION_PATTERNS = [
    ('位于', re.compile(r'^(?:部署在|位于|落地于|设在|坐落于)(?P<object>.+)$')),
    ('属于', re.compile(r'^(?:属于|隶属于|归属|下设)(?P<object>.+)$')),
    ('使用', re.compile(r'^(?:依赖|基于|采用|使用)(?P<object>.+)$')),
    ('连接', re.compile(r'^(?:连接|对接|集成|打通|接入)(?P<object>.+)$')),
    ('管理', re.compile(r'^(?:负责|管理|维护|运营|主导)(?P<object>.+)$')),
    ('提供', re.compile(r'^(?:提供|支撑|服务于|赋能)(?P<object>.+)$')),
    ('研发', re.compile(r'^(?:开发|研发|构建|打造|建设|推出|发布)(?P<object>.+)$')),
]

COOPERATION_PATTERN = re.compile(
    r'^(?P<left>[A-Za-z0-9\u4e00-\u9fff·._\- ]{2,40}?)\s*(?:与|和|及|同)\s*'
    r'(?P<right>[A-Za-z0-9\u4e00-\u9fff·._\- ]{2,40}?)\s*'
    r'(?P<verb>合作|协同|联合|共建|协作)'
    r'(?P<trail>.*)$'
)
PRODUCT_ACTION_PATTERN = re.compile(r'(?:开发|研发|构建|打造|建设|推出|发布)\s*(?P<object>.+)$')


def normalize_entity_name(value: str) -> str:
    text = str(value or '').replace('\ufeff', '').strip()
    if not text:
        return ''

    text = re.sub(r'^[\s"“”‘’`~!@#$%^&*()+={}\[\]|\\:;,.<>/?，。！？；：（）【】《》、]+', '', text)
    text = re.sub(r'[\s"“”‘’`~!@#$%^&*()+={}\[\]|\\:;,.<>/?，。！？；：（）【】《》、]+$', '', text)
    text = re.sub(r'\s+', ' ', text)

    changed = True
    while changed and text:
        changed = False
        for word in LEADING_NOISE_WORDS:
            if text.startswith(word) and len(text) > len(word) + 1:
                text = text[len(word):].strip()
                changed = True
        for word in VERB_WORDS:
            if text.startswith(word) and len(text) > len(word) + 1:
                text = text[len(word):].strip()
                changed = True
    for word in TRAILING_NOISE_WORDS:
        if text.endswith(word) and len(text) > len(word) + 1:
            text = text[:-len(word)].strip()

    latin_match = LATIN_WITH_SUFFIX_RE.match(text)
    if latin_match:
        text = latin_match.group(1)

    if len(text) < 2 or len(text) > 48:
        return ''
    if text in STOP_ENTITY_NAMES:
        return ''
    if re.fullmatch(r'[\d\W_]+', text):
        return ''
    return text


def normalize_entity_type(value: str, entity_name: str = '') -> str:
    raw = str(value or '').strip()
    mapped = ENTITY_TYPE_ALIASES.get(raw.lower()) if raw else None
    if mapped:
        return mapped
    if raw in {'人名', '地名', '组织', '技术术语', '产品', '系统', '部门', '事件', '时间', '实体'}:
        return raw

    if entity_name.endswith(ORG_SUFFIXES):
        if entity_name.endswith(('平台', '系统')) and re.search(r'[A-Za-z]', entity_name):
            return '系统'
        return '组织'
    if entity_name in COMMON_CITIES or entity_name.endswith(LOCATION_SUFFIXES):
        return '地名'
    if re.search(r'[A-Za-z]', entity_name):
        if any(entity_name.endswith(suffix) for suffix in GENERIC_PRODUCT_SUFFIXES):
            return '系统'
        return '技术术语'
    return '实体'


def normalize_relation_type(value: str) -> str:
    raw = str(value or '').strip()
    if not raw:
        return '相关'
    mapped = RELATION_TYPE_ALIASES.get(raw)
    if mapped:
        return mapped
    lowered = raw.lower()
    mapped = RELATION_TYPE_ALIASES.get(lowered)
    if mapped:
        return mapped
    if len(raw) > 12:
        return raw[:12]
    return raw


def _deduplicate_entities(values: Iterable[EntityTuple]) -> List[EntityTuple]:
    ordered = {}
    for name, entity_type in values:
        normalized_name = normalize_entity_name(name)
        if not normalized_name:
            continue
        normalized_type = normalize_entity_type(entity_type, normalized_name)
        previous_type = ordered.get(normalized_name)
        if previous_type in (None, '实体') or (normalized_type != '实体' and previous_type == '实体'):
            ordered[normalized_name] = normalized_type
    return [(name, entity_type) for name, entity_type in ordered.items()]


def _deduplicate_relations(values: Iterable[RelationTuple], valid_names: Sequence[str]) -> List[RelationTuple]:
    valid_name_set = set(valid_names)
    seen = set()
    relations = []
    for source, relation_type, target in values:
        normalized_source = normalize_entity_name(source)
        normalized_target = normalize_entity_name(target)
        normalized_relation = normalize_relation_type(relation_type)
        if not normalized_source or not normalized_target or normalized_source == normalized_target:
            continue
        if valid_name_set and (normalized_source not in valid_name_set or normalized_target not in valid_name_set):
            continue
        key = (normalized_source, normalized_relation, normalized_target)
        if key in seen:
            continue
        seen.add(key)
        relations.append(key)
    return relations


def _strip_markdown_code_block(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith('```'):
        return stripped
    parts = stripped.split('```')
    if len(parts) < 3:
        return stripped
    candidate = parts[1].strip()
    if candidate.startswith('json'):
        candidate = candidate[4:].strip()
    return candidate


def _parse_llm_payload(text: str) -> Tuple[List[EntityTuple], List[RelationTuple]]:
    payload_text = _strip_markdown_code_block(text)
    payload = json.loads(payload_text)

    entity_values = []
    relation_values = []

    if isinstance(payload, list):
        for item in payload:
            if not isinstance(item, dict):
                continue
            name = item.get('name') or item.get('entity') or item.get('entity_name')
            entity_type = item.get('type') or item.get('entity_type')
            if name:
                entity_values.append((name, entity_type or '实体'))
    elif isinstance(payload, dict):
        entities_raw = payload.get('entities') or payload.get('entity_list') or []
        relations_raw = payload.get('relations') or payload.get('relation_list') or []

        for item in entities_raw:
            if not isinstance(item, dict):
                continue
            name = item.get('name') or item.get('entity') or item.get('entity_name')
            entity_type = item.get('type') or item.get('entity_type')
            if name:
                entity_values.append((name, entity_type or '实体'))

        for item in relations_raw:
            if not isinstance(item, dict):
                continue
            source = item.get('source') or item.get('from') or item.get('head')
            target = item.get('target') or item.get('to') or item.get('tail')
            relation_type = item.get('type') or item.get('relation') or item.get('predicate')
            if source and target:
                relation_values.append((source, relation_type or '相关', target))

    entities = _deduplicate_entities(entity_values)
    entity_names = [name for name, _ in entities]
    relations = _deduplicate_relations(relation_values, entity_names)
    return entities, relations


def _call_llm(text: str, api_key: str, base_url: str, model: str) -> Tuple[List[EntityTuple], List[RelationTuple]]:
    if not api_key or not text.strip():
        return [], []

    snippet = text[:3500]
    prompt = (
        '请从以下文本中抽取知识图谱，返回 JSON 对象，格式如下：\n'
        '{\n'
        '  "entities": [{"name": "实体名称", "type": "实体类型"}],\n'
        '  "relations": [{"source": "实体A", "target": "实体B", "type": "关系类型"}]\n'
        '}\n\n'
        '要求：\n'
        '1. 实体类型尽量使用：人名、地名、组织、技术术语、产品、系统、部门、事件、时间、实体。\n'
        '2. 关系类型尽量使用：合作、属于、位于、使用、连接、研发、管理、提供、相关。\n'
        '3. 只保留文本中明确表达的关系，不要臆造。\n'
        '4. 如果没有关系，relations 返回空数组。\n'
        '5. 只返回 JSON，不要输出解释、markdown 或额外文字。\n\n'
        f'文本：\n{snippet}'
    )

    request_body = json.dumps({
        'model': model,
        'messages': [{'role': 'user', 'content': prompt}],
        'temperature': 0.1,
    }).encode('utf-8')

    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/v1/chat/completions",
        data=request_body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
        },
    )

    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode('utf-8'))

    content = payload['choices'][0]['message']['content'].strip()
    return _parse_llm_payload(content)


def _choose_primary_entity(fragment: str) -> str:
    candidates = _extract_entity_candidates_from_fragment(fragment)
    return candidates[0] if candidates else ''


def _split_targets(fragment: str) -> List[str]:
    cleaned = str(fragment or '').strip()
    if not cleaned:
        return []

    if CONNECTOR_SPLIT_RE.search(cleaned):
        parts = [part.strip() for part in CONNECTOR_SPLIT_RE.split(cleaned) if part.strip()]
    else:
        parts = [cleaned]

    targets = []
    for part in parts:
        candidate = _choose_primary_entity(part)
        if candidate:
            targets.append(candidate)
    return list(dict.fromkeys(targets))


def _extract_entity_candidates_from_fragment(fragment: str) -> List[str]:
    text = str(fragment or '').replace('\ufeff', '').strip()
    if not text:
        return []

    text = re.sub(r'^[的将把对在于与和及并由向给为跟同\s]+', '', text)
    text = re.sub(r'[的等及相关方面\s]+$', '', text)
    text = re.sub(r'^["“”‘’《》【】（）()\[\]：:、，,；;]+', '', text)
    text = re.sub(r'["“”‘’《》【】（）()\[\]：:、，,；;]+$', '', text)
    if not text:
        return []

    candidates = []

    latin_match = LATIN_WITH_SUFFIX_RE.match(text)
    if latin_match:
        candidates.append(latin_match.group(1))

    for pattern in (ORG_ENTITY_RE, LOCATION_ENTITY_RE, LATIN_ENTITY_RE):
        matches = sorted({normalize_entity_name(match.group(1) if match.lastindex else match.group(0)) for match in pattern.finditer(text)}, key=len, reverse=True)
        for match in matches:
            if match:
                candidates.append(match)

    normalized_text = normalize_entity_name(text)
    if normalized_text and not any(verb in normalized_text for verb in VERB_WORDS):
        candidates.append(normalized_text)

    ordered = []
    seen = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        ordered.append(candidate)
    return ordered


def _extract_rule_based_entities(text: str) -> List[EntityTuple]:
    entities = []

    for match in ORG_ENTITY_RE.finditer(text):
        name = normalize_entity_name(match.group(1))
        if name and not any(verb in name for verb in VERB_WORDS):
            entities.append((name, '组织'))

    for match in LOCATION_ENTITY_RE.finditer(text):
        name = normalize_entity_name(match.group(1))
        if name and not any(verb in name for verb in VERB_WORDS):
            entities.append((name, '地名'))

    for match in LATIN_ENTITY_RE.finditer(text):
        name = normalize_entity_name(match.group(0))
        if name and not any(verb in name for verb in VERB_WORDS):
            entities.append((name, '技术术语'))

    for match in PERSON_CONTEXT_RE.finditer(text):
        name = normalize_entity_name(match.group(1))
        if name:
            entities.append((name, '人名'))

    return _deduplicate_entities(entities)


def _extract_rule_based_relations(text: str, entities: Sequence[EntityTuple]) -> List[RelationTuple]:
    relations = []
    sentences = [segment.strip() for segment in SENTENCE_SPLIT_RE.split(text) if segment.strip()]

    for sentence in sentences:
        clauses = [segment.strip() for segment in CLAUSE_SPLIT_RE.split(sentence) if segment.strip()]
        last_subjects: List[str] = []

        for clause in clauses:
            normalized_clause = re.sub(r'^(?:并且|并|同时)\s*', '', clause)
            cooperation_match = COOPERATION_PATTERN.match(normalized_clause)
            if cooperation_match:
                left = _choose_primary_entity(cooperation_match.group('left'))
                right = _choose_primary_entity(cooperation_match.group('right'))
                if left and right:
                    relations.append((left, '合作', right))
                    last_subjects = [left, right]
                    product_match = PRODUCT_ACTION_PATTERN.search(cooperation_match.group('trail') or '')
                    if product_match:
                        targets = _split_targets(product_match.group('object'))
                        for source in last_subjects:
                            for target in targets:
                                relations.append((source, '研发', target))
                    continue

            explicit_handled = False
            for relation_type, pattern in EXPLICIT_RELATION_PATTERNS:
                match = pattern.match(normalized_clause)
                if not match:
                    continue
                subject = _choose_primary_entity(match.group('subject'))
                targets = _split_targets(match.group('object'))
                if subject and targets:
                    for target in targets:
                        relations.append((subject, relation_type, target))
                    last_subjects = [subject]
                    explicit_handled = True
                    break
            if explicit_handled:
                continue

            if last_subjects:
                for relation_type, pattern in IMPLICIT_RELATION_PATTERNS:
                    match = pattern.match(normalized_clause)
                    if not match:
                        continue
                    targets = _split_targets(match.group('object'))
                    if targets:
                        for subject in last_subjects:
                            for target in targets:
                                relations.append((subject, relation_type, target))
                        explicit_handled = True
                        break
            if explicit_handled:
                continue

            fallback_subject = _choose_primary_entity(normalized_clause)
            if fallback_subject:
                last_subjects = [fallback_subject]

    return _deduplicate_relations(relations, [])


def extract_knowledge_graph_data(text: str, api_key: str = '', base_url: str = '', model: str = ''):
    cleaned_text = str(text or '').replace('\ufeff', '').strip()
    if not cleaned_text:
        return {'entities': [], 'relations': [], 'strategy': 'empty'}

    llm_entities = []
    llm_relations = []
    strategy_parts = []

    if api_key:
        try:
            llm_entities, llm_relations = _call_llm(cleaned_text, api_key, base_url, model)
            if llm_entities or llm_relations:
                strategy_parts.append('llm')
        except Exception as error:
            logger.warning(f'LLM 实体关系抽取失败，转为规则抽取: {error}')

    rule_entities = _extract_rule_based_entities(cleaned_text)
    merged_entities = _deduplicate_entities(llm_entities + rule_entities)

    rule_relations = _extract_rule_based_relations(cleaned_text, merged_entities)
    tentative_relations = llm_relations + rule_relations

    if not llm_entities and not llm_relations:
        strategy_parts.append('rules')
    elif rule_relations and 'rules' not in strategy_parts:
        strategy_parts.append('rules')

    related_entity_names = set()
    for source_name, _, target_name in tentative_relations:
        related_entity_names.add(source_name)
        related_entity_names.add(target_name)

    existing_entity_names = {name for name, _ in merged_entities}
    for related_name in related_entity_names:
        if related_name not in existing_entity_names:
            merged_entities.append((related_name, normalize_entity_type('', related_name)))

    merged_entities = _deduplicate_entities(merged_entities)
    merged_relations = _deduplicate_relations(tentative_relations, [name for name, _ in merged_entities])

    strategy = '+'.join(strategy_parts) if strategy_parts else 'rules'
    return {
        'entities': merged_entities,
        'relations': merged_relations,
        'strategy': strategy,
    }
