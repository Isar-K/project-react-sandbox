import { motion, AnimatePresence } from "framer-motion";

function VesselSidebar({ vessel, onClose, darkMode, getShipTypeInfo }) {

  if (!vessel) return null;

  const info = getShipTypeInfo(vessel);

  return (
    <AnimatePresence>
      <motion.div
        className="vessel-sidebar"
        initial={{ x: 350 }}
        animate={{ x: 0 }}
        exit={{ x: 350 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          height: "100%",
          width: "350px",
          zIndex: 3000,
          overflowY: "auto",
          background: darkMode ? "rgba(10,10,10,0.92)" : "white",
          color: darkMode ? "#fff" : "#000",
          boxShadow: "0 0 20px rgba(0,0,0,0.4)",
          padding: "20px"
        }}
      >
        {/* Close Button */}
        <div
          style={{
            position: "absolute",
            right: "15px",
            top: "15px",
            cursor: "pointer",
            fontSize: "22px",
            color: darkMode ? "#fff" : "#000"
          }}
          onClick={onClose}
        >
          ✖
        </div>

        {/* Vessel Name */}
        <h2 style={{ marginTop: "10px" }}>
          {vessel.name || "Unknown Vessel"}
        </h2>
        <div style={{ opacity: 0.7 }}>
          MMSI: {vessel.mmsi} <br />
          IMO: {vessel.imo || "—"} <br />
          Type: {info.name}
        </div>

        {/* Photo */}
        <div style={{ marginTop: "15px" }}>
          <img
            src={`/ships/api/vessel/${vessel.mmsi}/photo`}
            alt="Vessel"
            style={{
              width: "100%",
              borderRadius: "10px",
              border: darkMode ? "1px solid #444" : "1px solid #ccc"
            }}
            onError={(e) => {
              e.target.src = "/static/placeholder_ship.png";
            }}
          />
        </div>

        {/* Ship Type Tag */}
        <div
          style={{
            marginTop: "10px",
            padding: "5px 10px",
            borderRadius: "6px",
            background: info.color,
            color: "#fff",
            display: "inline-block"
          }}
        >
          {info.icon} {info.name}
        </div>

        {/* Wind Assisted */}
        {vessel.wind_assisted && (
          <div
            style={{
              marginTop: "10px",
              padding: "5px 10px",
              borderRadius: "6px",
              background: "#00ff00",
              color: "#000",
              display: "inline-block",
              fontWeight: "bold"
            }}
          >
            🌬️ Wind-Assisted Vessel
          </div>
        )}

        {/* Specs */}
        <h3 style={{ marginTop: "20px" }}>Specifications</h3>
        <div style={{ opacity: 0.85 }}>
          Length: {vessel.length || "—"} m <br />
          Beam: {vessel.beam || "—"} m <br />
          Draft: {vessel.draft || "—"} m <br />
          GT: {vessel.gross_tonnage || "—"} <br />
          DWT: {vessel.deadweight || "—"} <br />
        </div>

        {/* Navigation Data */}
        <h3 style={{ marginTop: "20px" }}>Navigation</h3>
        <div style={{ opacity: 0.85 }}>
          Speed: {vessel.sog || 0} kn <br />
          Course: {vessel.cog || 0}° <br />
          Heading: {vessel.heading || 0}° <br />
          Last Update: {vessel.timestamp || "—"}
        </div>

        {/* Voyage */}
        <h3 style={{ marginTop: "20px" }}>Voyage</h3>
        <div style={{ opacity: 0.85 }}>
          Destination: {vessel.destination || "—"} <br />
          ETA: {vessel.eta || "—"} <br />
        </div>

        <div style={{ height: "40px" }}></div>
      </motion.div>
    </AnimatePresence>
  );
}
export default VesselSidebar;
