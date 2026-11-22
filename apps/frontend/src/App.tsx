
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/auth/Login";

import StudentDashboard from "./components/common/student/Dashboard/StudentDashboard";

import StudentSearchRoute from "./components/common/student/Search/StudentSearchRoute";
import StudentSearchResults from "./components/common/student/Search/StudentSearchResults";
import StudentBookingOptions from "./components/common/student/Search/StudentBookingOptions";

import StudentServiceSelection from "./components/common/student/StudentReservation/StudentServiceSelection";
import StudentVehicleReservation from "./components/common/student/StudentReservation/StudentVehicleReservation";
import StudentParkingReservation from "./components/common/student/StudentReservation/StudentParkingReservation";
import StudentVehicleReturn from "./components/common/student/StudentReservation/StudentVehicleReturn";

import StudentChargingReservation from "./components/common/student/Charging/StudentChargingReservation";
import StudentReservationConfirmation from "./components/common/student/StudentReservation/StudentReservationConfirmation";

import OperatorDashboard from "./components/common/operator/Dashboard/OperatorDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Authentication */}
        <Route path="/login" element={<Login mode="student" />} />
        <Route path="/operator/login" element={<Login mode="operator" />} />

        {/* Student */}
        <Route path="/student" element={<StudentDashboard />} />

        {/* Student route search */}
        <Route
          path="/student/booking/search"
          element={<StudentSearchRoute />}
        />
        <Route
          path="/student/booking/results"
          element={<StudentSearchResults />}
        />
        <Route
          path="/student/booking/options"
          element={<StudentBookingOptions />}
        />

        {/* Student reservation */}
        <Route
          path="/student/reservation"
          element={<StudentServiceSelection />}
        />
        <Route
          path="/student/reservation/vehicle"
          element={<StudentVehicleReservation />}
        />
        <Route
          path="/student/reservation/parking"
          element={<StudentParkingReservation />}
        />
        <Route
          path="/student/reservation/charging"
          element={<StudentChargingReservation />}
        />
        <Route
          path="/student/reservation/confirmation"
          element={<StudentReservationConfirmation />}
        />

        {/* Student vehicle return */}
        <Route
          path="/student/vehicle-return"
          element={<StudentVehicleReturn />}
        />

        {/* Operator */}
        <Route path="/operator" element={<OperatorDashboard />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
