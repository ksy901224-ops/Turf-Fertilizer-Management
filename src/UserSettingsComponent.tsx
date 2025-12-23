
import React, { useEffect, useState } from "react";
import { getSettings, saveSettings } from "./api";
import { UserSettings } from "./constants";
import { CloseIcon } from "./icons";

interface Props {
  userId: string;
  onClose?: () => void;
}

const UserSettingsComponent: React.FC<Props> = ({ userId, onClose }) => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ Firestore에서 사용자 설정 불러오기
  useEffect(() => {
    async function fetchSettings() {
      const data = await getSettings(userId);
      setSettings(data);
      setLoading(false);
    }
    fetchSettings();
  }, [userId]);

  // ✅ 입력값 변경 핸들러
  const handleChange = (field: keyof UserSettings, value: string | number) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: String(value) });
  };

  // ✅ Firestore에 저장
  const handleSave = async () => {
    if (!settings) return;
    await saveSettings(userId, settings);
    alert("설정이 저장되었습니다!");
    if (onClose) onClose();
  };

  if (loading) return <div className="p-8 text-center text-slate-500">사용자 설정을 불러오는 중...</div>;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl">
      <div className="flex justify-between items-center p-6 border-b">
        <h2 className="text-xl font-bold text-slate-800">관리 구역 및 가이드 설정</h2>
        {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
                <CloseIcon />
            </button>
        )}
      </div>

      <div className="p-6 space-y-6 overflow-y-auto flex-1">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">그린 면적 (㎡)</label>
              <input
                type="number"
                value={settings?.greenArea ?? ""}
                onChange={(e) => handleChange("greenArea", e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-semibold"
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">티 면적 (㎡)</label>
              <input
                type="number"
                value={settings?.teeArea ?? ""}
                onChange={(e) => handleChange("teeArea", e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-semibold"
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">페어웨이 면적 (㎡)</label>
              <input
                type="number"
                value={settings?.fairwayArea ?? ""}
                onChange={(e) => handleChange("fairwayArea", e.target.value)}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-semibold"
                placeholder="0"
              />
            </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">시비 가이드 선택</label>
          <select
            value={settings?.selectedGuide ?? "난지형잔디 (한국잔디)"}
            onChange={(e) => handleChange("selectedGuide", e.target.value)}
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-semibold bg-slate-50"
          >
            <option value="난지형잔디 (한국잔디)">난지형잔디 (한국잔디)</option>
            <option value="한지형잔디 (벤트그라스)">한지형잔디 (벤트그라스)</option>
            <option value="한지형잔디 (켄터키블루그라스)">한지형잔디 (켄터키블루그라스)</option>
          </select>
        </div>
      </div>

      <div className="p-6 border-t bg-slate-50 rounded-b-xl">
        <button
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all text-lg"
            onClick={handleSave}
        >
            설정 저장하기
        </button>
      </div>
    </div>
  );
};

export default UserSettingsComponent;
