/** 새 식별자 발급 포트. 결정론적 테스트를 위해 주입한다 (Clock과 동일한 패턴). */
export interface IdGenerator {
  newId(): string;
}

export const cryptoIdGenerator: IdGenerator = {
  newId: () => crypto.randomUUID(),
};
