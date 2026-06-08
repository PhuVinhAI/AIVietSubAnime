# Bước 3 — Hardsub (burn-in) bằng HandBrake

Sau khi đã có `04_VietSub/vietsub.ass`, dùng HandBrake để "đóng cứng" phụ đề vào video, xuất file thành phẩm vào `05_HardSub/`.

> Không tự động hoá bằng .bat vì HandBrake CLI có nhiều flag dễ sai. GUI an toàn hơn cho fansub thủ công.

---

## Cài font trước (BẮT BUỘC)

Mở `Styles/Default.ass` xem dòng `Style: Default,<font-name>,...`. Nếu font đó chưa cài vào Windows, HandBrake sẽ thay bằng font hệ thống → sub sẽ xấu/sai.

- Mặc định project dùng **Roboto** — tải tại https://fonts.google.com/specimen/Roboto
- Copy file `.ttf` vào `%WINDIR%\Fonts` hoặc double-click rồi bấm **Install**

---

## Các bước trong HandBrake GUI

1. **Open Source** → chọn file `.mkv` trong `01_Raw/`.

2. **Save As** (góc dưới):
   - Trỏ tới `Anime/<tên-anime>/05_HardSub/`
   - Đặt tên: `<tên tập>_vietsub.mp4`

3. Tab **Subtitles**:
   - Bấm **Tracks** → **Import Subtitle** → chọn `04_VietSub/vietsub.ass`
   - Tick ô **Burned In** cho track vừa import ← **BƯỚC QUAN TRỌNG NHẤT**
   - Bỏ chọn các track sub có sẵn trong .mkv (nếu có)

4. Tab **Video**:
   - Video Encoder: **H.264 (x264)**
   - Framerate: **Same as source**, **Constant Framerate**
   - Quality: **RF 20** (cân bằng) hoặc **RF 18** (chất lượng cao, file lớn hơn)

5. Tab **Audio**:
   - Giữ track tiếng Nhật (lang `jpn`)
   - Codec: **AAC**, bitrate **192 kbps** (hoặc **Passthru** để giữ nguyên)

6. Tab **Dimensions** (nếu cần):
   - Anamorphic: **None**
   - Resolution Limit: **Same as source**

7. Bấm **Start Encode** → đợi xong (1080p HEVC → MP4 H.264 thường mất 15-40 phút/tập tuỳ CPU).

---

## Kiểm tra sau khi encode

Mở file mp4 trong `05_HardSub/` bằng VLC:
- Sub tiếng Việt hiện đè lên hình ✓
- Font đúng (không bị nhảy sang Arial mặc định) ✓
- Vị trí, màu, viền giống `Default.ass` ✓
- Audio tiếng Nhật chạy bình thường ✓

Nếu lỗi font → quay lại bước cài font, encode lại.

---

## Preset HandBrake (tuỳ chọn)

Sau lần đầu setup đúng, bấm **Presets** → **Save New Preset** → đặt tên `AnimeVietSub`. Các lần sau chỉ cần Open Source → chọn preset → import sub → Burned In → Start.
