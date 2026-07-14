import "./App.css";

import { APP_INFO } from "./app/appInfo";

function App() {
  return (
    <main className="container">
      <p className="milestone-badge">
        {APP_INFO.milestoneId} · {APP_INFO.milestoneTitle}
      </p>
      <h1>{APP_INFO.name}</h1>
      <p className="tagline">{APP_INFO.tagline}</p>

      <section className="status" aria-label="현재 개발 상태">
        <h2>현재 상태</h2>
        <p>
          지금은 프로젝트 기반({APP_INFO.milestoneId})만 완료된 단계입니다. 시장 데이터 조회, 차트,
          리플레이, 투자 시뮬레이션 기능은 아직 구현되지 않았습니다.
        </p>
      </section>
    </main>
  );
}

export default App;
