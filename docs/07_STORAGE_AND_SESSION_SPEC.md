# 로컬 저장과 세션 명세

## 1. SQLite 역할

- 정규화된 Instrument 메타데이터
- 일봉 Candle 캐시
- 데이터 출처와 버전
- 저장된 리플레이 세션
- 사용자 기본 설정

민감한 인증정보는 일반 SQLite 평문 테이블에 저장하지 않는다.

## 2. 개념 테이블

### instruments

- id
- symbol
- display_name
- asset_class
- market
- quote_currency
- exchange_timezone
- provider_id
- provider_symbol
- status
- updated_at

### candles

- instrument_id
- interval
- open_time_utc_ms
- close_time_utc_ms
- trading_date
- open/high/low/close
- adjusted_close
- volume
- quote_currency
- provider_id
- fetched_at
- data_version

복합 unique key를 둔다.

### replay_sessions

- id
- name
- schema_version
- configuration_json
- data_version_json
- created_at
- updated_at

## 3. 마이그레이션

- 스키마 변경은 버전 관리되는 마이그레이션으로 수행한다.
- 앱 시작 시 현재 버전과 호환성을 검사한다.
- 실패 시 DB를 자동 삭제하지 않는다.
- 개발 편의를 이유로 사용자 캐시를 무조건 초기화하지 않는다.

## 4. 세션 재현성

저장 세션에는 최소한 다음이 들어간다.

- Instrument IDs와 provider symbol
- 기간
- interval
- 표시 기준
- SimulationConfig
- Replay speed
- 데이터 공급자와 dataVersion
- 앱 또는 계산 schemaVersion

현재 데이터가 저장 당시와 달라졌다면 사용자에게 알리고 다음 선택지를 제공할 수 있다.

- 저장 당시 캐시로 재생
- 최신 데이터로 다시 계산

MVP에서는 가능한 범위만 구현하되 데이터 버전을 버리지 않는다.

## 5. 내보내기

초기 지원:

- 세션 JSON
- 포트폴리오 시계열 CSV

파일에는 가정과 데이터 출처를 함께 기록한다.
