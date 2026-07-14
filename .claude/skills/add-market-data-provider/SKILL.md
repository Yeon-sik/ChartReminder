---
name: add-market-data-provider
description: 새로운 시장 데이터 공급자를 공통 계약, 정규화, 캐시, 이용조건과 함께 안전하게 추가한다.
---

# Add Market Data Provider

1. 공급자의 현재 공식 문서와 이용조건을 확인한다.
2. 지원 시장, 심볼, 통화, 시간대, 조정 가격, 호출 제한을 기록한다.
3. 기존 MarketDataProvider port를 구현한다. Provider 전용 타입을 도메인에 누출하지 않는다.
4. 응답 런타임 검증, Decimal 변환, 정렬, 중복 제거를 구현한다.
5. 오류와 Rate limit을 공통 오류로 매핑한다.
6. 공통 Provider 계약 테스트를 실행한다.
7. fixture 기반 통합 테스트를 추가한다.
8. 캐시 정책과 dataVersion을 기록한다.
9. 재배포 조건이 불명확하면 공개 기능을 활성화하지 않는다.
