
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Get the access token saved after login.
export const getAccessToken = (): string | null => {
  return (
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken")
  );
};

// Attach the Bearer Token to every API request.
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Make authentication errors easier to understand.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      error.message =
        "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng xuất và đăng nhập lại.";
    } else if (error.response?.status === 403) {
      error.message =
        "Tài khoản của bạn không có quyền thực hiện thao tác này.";
    }

    return Promise.reject(error);
  }
);

export default api;
