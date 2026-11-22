
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../services/api";
import "./Login.css";
import axios from "axios";

interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

interface LoginProps {
  mode?: "student" | "operator";
}

function Login({ mode = "student" }: LoginProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(
    location.state?.sessionExpired
      ? "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại."
      : ""
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isOperatorLogin = mode === "operator";

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });

      const { accessToken, user } = response.data;

      // Kiểm tra role theo trang đăng nhập
      const userRole = user.role.toLowerCase();

      if (
        (isOperatorLogin && userRole !== "operator") ||
        (!isOperatorLogin && userRole !== "student")
      ) {
        setError(
          isOperatorLogin
            ? "Vui lòng sử dụng tài khoản Operator để đăng nhập."
            : "Vui lòng sử dụng tài khoản sinh viên để đăng nhập."
        );
        return;
      }

      // Xóa token cũ ở cả hai nơi để tránh sử dụng nhầm token.
      localStorage.removeItem("accessToken");
      sessionStorage.removeItem("accessToken");

      localStorage.removeItem("user");
      sessionStorage.removeItem("user");

      // Lưu token theo lựa chọn Remember me.
      const storage = rememberMe ? localStorage : sessionStorage;

      storage.setItem("accessToken", accessToken);
      storage.setItem("user", JSON.stringify(user));

      // Điều hướng theo role
      navigate(isOperatorLogin ? "/operator" : "/student");
    } catch (err: unknown) {
      console.error("Login error:", err);

      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setError(
            "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại."
          );
          return;
        }

        const errorCode = err.response.data?.code;

        switch (errorCode) {
          case "INVALID_CREDENTIALS":
            setError("Email hoặc mật khẩu không chính xác. Vui lòng thử lại.");
            break;

          case "ACCOUNT_LOCKED":
            setError(
              "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ."
            );
            break;

          case "VALIDATION_ERROR":
            setError("Thông tin đăng nhập không hợp lệ. Vui lòng kiểm tra lại.");
            break;

          case "DATABASE_UNAVAILABLE":
            setError("Hệ thống hiện không khả dụng. Vui lòng thử lại sau.");
            break;

          default:
            setError("Đã xảy ra lỗi. Vui lòng thử lại sau.");
            break;
        }
      } else {
        setError("Đã xảy ra lỗi không xác định. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="top-bar"></div>

      <div className="login-container">
        <div className="brand">
          <div className="brand-icon">♟</div>
          <div className="brand-text">
            <span>Đại học Bách Khoa HCM</span>
            <strong>Smart E-Mobility Hub</strong>
          </div>
        </div>

        <div className="bike-icon">
          <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
            <g
              fill="none"
              stroke="#009688"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="25" cy="58" r="15" />
              <circle cx="94" cy="58" r="15" />
              <path d="M25 58 L45 58 L60 28 L75 58 L45 58 L38 39" />
              <path d="M60 28 L80 28 L94 58" />
              <path d="M38 39 L52 39" />
              <path d="M62 20 L78 20 L85 39" />
              <path d="M78 20 L73 8" />
            </g>
            <path
              d="M48 78 L68 78 L59 88 L80 94 L62 80 L48 80 Z"
              fill="#009688"
            />
          </svg>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <h2>{isOperatorLogin ? "Operator Login" : "Student Login"}</h2>
          <p className="login-description">
            {isOperatorLogin
              ? "Đăng nhập dành cho Operator và quản lý hệ thống"
              : "Vui lòng đăng nhập bằng tài khoản sinh viên"}
          </p>

          <div className="form-group">
            <label>{isOperatorLogin ? "Email" : "University Email"}</label>
            <input
            type="email"
            placeholder={isOperatorLogin ? "operator@example.com" : "student@hcmut.edu.vn"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            />
          </div>

          <div className="form-group">
            <label>Password</label>

            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M3 3L21 21" />
                    <path d="M10.6 10.6A2 2 0 0 0 13.4 13.4" />
                    <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.4 3.3" />
                    <path d="M6.2 6.2C4.2 7.5 2.8 9.7 2.5 12c1 2.5 4.5 7 9.5 7 1 0 2-.2 2.9-.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="form-options">
            <label className="remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me?</span>
            </label>

            <a href="#">Forgot password?</a>
          </div>

          {error && <p className="error-message">{error}</p>}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          {!isOperatorLogin && (
            <div className="operator-login-link">
              <p>Bạn là Operator hoặc quản lý hệ thống?</p>
              <button
                type="button"
                onClick={() => navigate("/operator/login")}
              >
                Đăng nhập dành cho Operator →
              </button>
            </div>
          )}

          {isOperatorLogin && (
            <div className="operator-login-link">
              <p>Bạn là sinh viên?</p>
              <button
                type="button"
                onClick={() => navigate("/login")}
              >
                Quay lại Student Login →
              </button>
            </div>
          )}
        </form>
      </div>

      <div className="bottom-bar"></div>
    </div>
  );
}

export default Login;
