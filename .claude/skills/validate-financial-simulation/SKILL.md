---
name: validate-financial-simulation
description: 투자 시뮬레이션 변경을 Golden Fixture와 독립 계산으로 검증하고 결과·반올림·가정을 감사한다.
---

# Validate Financial Simulation

사용 시점: simulation domain, 수익률, 수량, 수수료, 정기매수, 낙폭 변경 후.

절차:

1. 관련 명세와 Golden Fixture를 읽는다.
2. 변경된 계산 경로와 입력 단위를 추적한다.
3. 일반 JS number 누적 계산이 없는지 검사한다.
4. 기대값이 구현 코드에서 생성되지 않았는지 확인한다.
5. 최소 하나의 수기 또는 독립 계산으로 검산한다.
6. 정상·경계·오류 테스트를 실행한다.
7. 반올림, 수수료, 휴장일, carried-forward 정책을 결과에 명시한다.
8. 발견 사항을 심각도순으로 보고한다.
