# 리플레이 엔진 명세

## 1. 역할

리플레이 엔진은 이미 준비된 데이터셋을 가상 시계에 따라 한 단계씩 공개한다. 네트워크 요청, DB 조회, 투자 계산, 차트 렌더링을 직접 수행하지 않는다.

## 2. 상태

```typescript
type ReplayStatus =
  | 'idle'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'error';
```

```typescript
interface ReplayState {
  status: ReplayStatus;
  cursor: number;
  startIndex: number;
  endIndex: number;
  speed: ReplaySpeed;
}
```

## 3. 명령

- initialize(dataset)
- play()
- pause()
- stepForward()
- seek(index 또는 date)
- setSpeed(speed)
- restart()
- dispose()

## 4. 속도

속도는 시장 데이터 조회 속도가 아니라 UI에서 다음 스텝으로 진행하는 가상 시간 간격이다.

권장 프리셋:

- 0.25x
- 0.5x
- 1x
- 2x
- 5x
- 10x

정확한 기본 간격은 UI 테스트 후 결정한다.

## 5. 결정론성

동일한 데이터셋, 시작 인덱스, 명령 순서는 동일한 상태 전이를 만들어야 한다.

타이머는 상태 머신 바깥의 scheduler adapter로 분리한다. 단위 테스트에서는 가짜 시계를 사용한다.

## 6. 여러 자산 날짜 동기화

- 전역 타임라인은 자산 거래일의 합집합이다.
- 해당 날짜에 캔들이 없는 자산은 새 가격을 생성하지 않는다.
- 차트는 gap을 유지한다.
- 포트폴리오 평가용 마지막 가격 전달은 simulation input adapter가 처리하며 `carried-forward`를 표시한다.

## 7. 이벤트

엔진은 다음과 같은 이벤트 또는 상태 스냅샷을 제공할 수 있다.

- replayReady
- replayStarted
- cursorChanged
- speedChanged
- replayPaused
- replayCompleted
- replayFailed

구현 방식은 상태 관리 도구에 종속되지 않아야 한다.

## 8. 필수 테스트

- 초기화 전 play 거부
- ready → playing
- playing → paused → playing
- stepForward 한 칸만 이동
- 마지막 인덱스에서 completed
- restart 후 동일 초기 상태
- seek 경계값
- 재생 중 속도 변경
- 중복 타이머 생성 방지
- dispose 후 이벤트 발생 방지
- 가짜 시계에서 완전 결정론적 실행
