import { useState } from "react";
import axios from "axios";

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("Your AI output will appear here.");
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState("summarize");

  const runAiTask = async (task) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResult("Please enter text first.");
      return;
    }

    setActiveTask(task);
    setLoading(true);

    try {
      const res = await axios.post("/api/ai", { task, text: trimmed });
      setResult(res.data?.result || "No response generated.");
    } catch (err) {
      const message = err?.response?.data?.result || "Unable to process the request right now.";
      setResult(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="frame">
        <aside className="leftRail">
          <div className="brand">R</div>
          <div className="railIcons">
            <span className="dot active" />
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
          <div className="avatar" />
        </aside>

        <section className="historyPanel">
          <header className="panelHeader">
            <h2>Chat Results</h2>
            <p>Today</p>
          </header>

          <article className="historyCard highlight">
            <div className="cardTop">
              <strong>Image Generation</strong>
              <span>↗</span>
            </div>
            <div className="parrotArt" />
            <p>Parrot images</p>
          </article>

          <h3 className="subTitle">Yesterday</h3>
          <article className="historyCard">
            <div className="cardTop">
              <strong>AI Search</strong>
              <span>↗</span>
            </div>
            <p>How to decrease CAC?</p>
          </article>
        </section>

        <section className="chatPanel">
          <header className="chatHeader">
            <h1>New Chat</h1>
            <button className="ghost">×</button>
          </header>

          <div className="intro">
            <div className="userPic" />
            <div>
              <p className="muted">Hi, Mary!</p>
              <h4>How can I help you?</h4>
            </div>
          </div>

          <div className="taskChips">
            <button
              className={activeTask === "summarize" ? "chip activeChip" : "chip"}
              onClick={() => runAiTask("summarize")}
              disabled={loading}
            >
              {loading && activeTask === "summarize" ? "Summarizing..." : "Summarize Notes"}
            </button>
            <button
              className={activeTask === "tasks" ? "chip activeChip" : "chip"}
              onClick={() => runAiTask("tasks")}
              disabled={loading}
            >
              {loading && activeTask === "tasks" ? "Generating..." : "Generate Tasks"}
            </button>
            <button
              className={activeTask === "improve" ? "chip activeChip" : "chip"}
              onClick={() => runAiTask("improve")}
              disabled={loading}
            >
              {loading && activeTask === "improve" ? "Improving..." : "Improve Writing"}
            </button>
          </div>

          <div className="resultBox">
            <h5>AI Response</h5>
            <p>{result}</p>
          </div>

          <div className="inputWrap">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask me anything..."
              rows={4}
            />
          </div>
        </section>
      </section>

      <style jsx>{`
        .page {
          min-height: 100vh;
          margin: 0;
          padding: 28px;
          background: radial-gradient(circle at 15% 10%, #cdbaff 0%, #9774ff 38%, #5b36c4 100%);
          font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        }
        .frame {
          max-width: 1250px;
          margin: 0 auto;
          border-radius: 28px;
          background: #f8f6fb;
          display: grid;
          grid-template-columns: 72px 340px 1fr;
          overflow: hidden;
          box-shadow: 0 28px 60px rgba(35, 9, 89, 0.35);
          border: 1px solid rgba(170, 147, 238, 0.45);
          min-height: 82vh;
        }
        .leftRail {
          background: #fbf9ff;
          border-right: 1px solid #ece7f8;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 22px 10px;
        }
        .brand {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: #111;
          color: #fff;
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: 20px;
        }
        .railIcons {
          display: grid;
          gap: 16px;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #cfc8de;
        }
        .dot.active {
          background: #5d69ff;
          width: 12px;
          height: 12px;
          box-shadow: 0 0 0 4px #dde2ff;
        }
        .avatar {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          background: linear-gradient(135deg, #e4b5aa, #8b4d45);
        }
        .historyPanel {
          padding: 28px 20px;
          background: #f4f1fa;
          border-right: 1px solid #ece7f8;
        }
        .panelHeader h2 {
          margin: 0;
          font-size: 38px;
          font-weight: 700;
          letter-spacing: -0.4px;
        }
        .panelHeader p {
          margin: 4px 0 18px;
          color: #6f6882;
          font-weight: 600;
        }
        .historyCard {
          background: #fff;
          border-radius: 20px;
          padding: 14px;
          margin-bottom: 18px;
          border: 1px solid #ece8f6;
        }
        .historyCard.highlight {
          background: linear-gradient(180deg, #f7f4ff 0%, #ecf8e7 100%);
        }
        .cardTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #2c263d;
          margin-bottom: 10px;
        }
        .parrotArt {
          height: 170px;
          border-radius: 16px;
          background: radial-gradient(circle at 30% 30%, #ffde86 0%, #ff9f57 28%, #ef4e3a 52%, #8acf9b 78%, #effbe7 100%);
          margin-bottom: 10px;
        }
        .subTitle {
          margin: 4px 0 10px;
          color: #2f2743;
        }
        .chatPanel {
          padding: 26px 28px;
          background: #f9f7fc;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .chatHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .chatHeader h1 {
          margin: 0;
          font-size: 42px;
          letter-spacing: -0.5px;
          color: #201933;
        }
        .ghost {
          border: none;
          background: transparent;
          font-size: 24px;
          cursor: pointer;
          color: #7a718d;
        }
        .intro {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .userPic {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: linear-gradient(145deg, #f4d0b7, #876f63);
        }
        .intro h4 {
          margin: 2px 0 0;
          font-size: 30px;
          color: #211935;
        }
        .muted {
          margin: 0;
          color: #7d768f;
          font-size: 14px;
        }
        .taskChips {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .chip {
          border: 1px solid #e6ddf7;
          background: #fff;
          color: #3b3250;
          border-radius: 14px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .chip:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .activeChip {
          background: #6f57e9;
          color: #fff;
          border-color: #6f57e9;
        }
        .resultBox {
          background: #fff;
          border-radius: 16px;
          padding: 18px;
          border: 1px solid #ece7f7;
          min-height: 190px;
        }
        .resultBox h5 {
          margin: 0 0 10px;
          color: #201933;
          font-size: 15px;
          letter-spacing: 0.2px;
        }
        .resultBox p {
          margin: 0;
          color: #3a334b;
          white-space: pre-wrap;
          line-height: 1.6;
        }
        .inputWrap {
          background: #fff;
          border: 1px solid #e7e0f5;
          border-radius: 16px;
          padding: 12px;
        }
        .inputWrap textarea {
          width: 100%;
          border: none;
          resize: vertical;
          font: inherit;
          color: #2d2540;
          outline: none;
          background: transparent;
        }
        @media (max-width: 1060px) {
          .frame {
            grid-template-columns: 66px 1fr;
          }
          .historyPanel {
            display: none;
          }
          .chatHeader h1 {
            font-size: 36px;
          }
          .intro h4 {
            font-size: 24px;
          }
        }
        @media (max-width: 640px) {
          .page {
            padding: 10px;
          }
          .frame {
            min-height: 94vh;
            border-radius: 20px;
            grid-template-columns: 1fr;
          }
          .leftRail {
            display: none;
          }
          .chatPanel {
            padding: 18px;
          }
          .chatHeader h1 {
            font-size: 30px;
          }
        }
      `}</style>
    </main>
  );
}
