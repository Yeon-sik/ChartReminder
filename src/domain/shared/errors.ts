/**
 * 도메인 불변조건 위반을 나타내는 오류.
 *
 * 시스템 오류(네트워크, 저장소 등)와 구분되는 데이터·규칙 위반이다.
 * 오류를 삼키지 않기 위해 위반 목록을 함께 보존한다.
 */
export class DomainValidationError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[] = []) {
    super(issues.length > 0 ? `${message}: ${issues.join("; ")}` : message);
    this.name = "DomainValidationError";
    this.issues = issues;
  }
}
