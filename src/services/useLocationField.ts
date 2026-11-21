import { useEffect, useState } from "react";

import routeService, {
  type LocationPoint,
} from "./route.service";

export const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 500;

// Quản lý một ô nhập địa điểm: văn bản, địa điểm đã chọn và gợi ý (debounce)
export function useLocationField(errorLabel: string) {
  const [text, setText] = useState("");
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [suggestions, setSuggestions] = useState<LocationPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (text.trim().length < MIN_QUERY_LENGTH || location?.label === text) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setSuggestions(await routeService.searchPlaces(text));
      } catch (err) {
        console.error(errorLabel, err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text, location]);

  return {
    text,
    location,
    suggestions,
    loading,

    // Người dùng gõ → bỏ địa điểm đã chọn
    change: (value: string) => {
      setText(value);
      setLocation(null);
    },

    // Chọn một địa điểm (từ gợi ý hoặc GPS)
    choose: (point: LocationPoint) => {
      setLocation(point);
      setText(point.label);
      setSuggestions([]);
    },

    // Gán trực tiếp cả văn bản và địa điểm (dùng khi đổi chỗ)
    set: (value: string, point: LocationPoint | null) => {
      setText(value);
      setLocation(point);
      setSuggestions([]);
    },

    reset: () => {
      setText("");
      setLocation(null);
      setSuggestions([]);
    },
  };
}

export type LocationField = ReturnType<typeof useLocationField>;