import { useState, useRef, useEffect } from "react";
import { Play, Pause, Download } from "lucide-react";
import { motion } from "framer-motion";
import useAuth from "../../store/useAuth"; 

const RecordingPlayer = ({ url }) => {
   const { role } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  if (!url) {
    return <span className="text-gray-400">No Recording</span>;
  }

  const getFinalUrl = () => {
    let parsedUrl = url.endsWith(".wav") ? url : `${url}.wav`;

    const isLocal =
      parsedUrl.includes("192.168.") ||
      parsedUrl.includes("localhost") ||
      parsedUrl.includes("127.0.0.1");

    const currentHost = window.location.hostname;
    const currentProtocol = window.location.protocol;

    try {
      const urlObj = new URL(parsedUrl);
      if (isLocal) {
        urlObj.hostname = currentHost;
        urlObj.protocol = currentProtocol;
        urlObj.port = "";
      }
      return urlObj.toString();
    } catch {
      return parsedUrl;
    }
  };

  const finalUrl = getFinalUrl();

  // ⏸ Auto pause when another player starts
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    const handleGlobalPause = (e) => {
      if (audio !== e.detail) {
        audio.pause();
        setIsPlaying(false);
      }
    };

    audio.addEventListener("ended", handleEnded);
    window.addEventListener("pauseAllPlayers", handleGlobalPause);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      window.removeEventListener("pauseAllPlayers", handleGlobalPause);
    };
  }, []);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      // 🔈 Pause all other players first
      window.dispatchEvent(new CustomEvent("pauseAllPlayers", { detail: audio }));

      audio.play().catch((err) => {
        console.error("Playback failed:", err);
      });
      setIsPlaying(true);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(finalUrl, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch the audio file.");

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "recording.wav";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <audio ref={audioRef} src={finalUrl} preload="auto" />

{role === "admin" && (
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={handlePlayPause}
        className="p-1 shadow-sm hover:bg-pink-50 transition"
      >
        {isPlaying ? (
          <Pause className="w-3 h-3 text-pink-600" />
        ) : (
          <Play className="w-3 h-3 text-pink-600" />
        )}
      </motion.button>
        )}

      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={handleDownload}
        className="p-1 shadow-sm hover:bg-blue-50 transition"
      >
        <Download className="w-3 h-3 text-blue-600" />
      </motion.button>
    </div>
  );
};

export default RecordingPlayer;
