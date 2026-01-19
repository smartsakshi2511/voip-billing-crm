import { useEffect, useState } from "react";
import axios from "axios";

function AgentCrud() {
  const [name, setName] = useState("");
  const [ext, setExt] = useState("");
  const [agents, setAgents] = useState([]);

  const fetchAgents = async () => {
    const res = await axios.get("http://localhost:5000/agents");
    setAgents(res.data);
  };

  const addAgent = async () => {
    await axios.post("http://localhost:5000/agents", {
      name,
      extension: ext,
    });
    setName("");
    setExt("");
    fetchAgents();
  };

  const deleteAgent = async (id) => {
    await axios.delete(`http://localhost:5000/agents/${id}`);
    fetchAgents();
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  return (
    <div>
      <h3>Add Agent</h3>
      <input
        placeholder="Agent Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        placeholder="Extension"
        value={ext}
        onChange={(e) => setExt(e.target.value)}
      />
      <button onClick={addAgent}>Add</button>

      <h3>Agent List</h3>
      {agents.map((a) => (
        <div key={a._id}>
          {a.name} - {a.extension}
          <button onClick={() => deleteAgent(a._id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}

export default AgentCrud;
