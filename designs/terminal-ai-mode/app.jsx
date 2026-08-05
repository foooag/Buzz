// app.jsx — index.html entry: the standalone AI-mode demo.
//   A thin wrapper (Sidebar + AiSession) around the shared AiSession
//   workspace. Mounts to #root.

const { Sidebar } = window;
const { AiSession } = window;

function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-void text-mist">
      <Sidebar />
      <AiSession />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
