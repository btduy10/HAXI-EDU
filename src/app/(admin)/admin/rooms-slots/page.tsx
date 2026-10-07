import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { orderSlotFrames } from "@/domain/time-slots";
import { formatDate, formatTime } from "@/lib/format";
import {
  createHolidayAction,
  createRoomAction,
  createTimeSlotAction,
  deleteHolidayAction,
  deleteRoomAction,
  deleteTimeSlotAction,
  updateRoomAction,
  updateTimeSlotAction,
} from "@/server/actions/admin";
import { listHolidays, listRooms, listTimeSlots } from "@/server/services/catalog";
import { listClasses } from "@/server/services/classes";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Phòng & Ca học" };

const roomFields: Field[] = [
  { name: "name", label: "Tên phòng", required: true },
  { name: "capacity", label: "Sức chứa", type: "number", required: true },
];

const slotFields: Field[] = [
  { name: "name", label: "Tên ca", required: true, hint: "Một ca có nhiều khung giờ: thêm từng khung với cùng tên ca (vd. Ca chiều)." },
  { name: "defaultStart", label: "Giờ bắt đầu mặc định", type: "time", required: true },
  {
    name: "defaultEnd",
    label: "Giờ kết thúc mặc định",
    type: "time",
    required: true,
    hint: "Đổi giờ ca chỉ áp dụng cho buổi sinh sau này; buổi đã có giữ nguyên giờ.",
  },
];

export default async function RoomsSlotsPage() {
  const { actor, role, can } = await requireMenu("rooms");
  const admin = role === "admin";
  const [rooms, slots, holidays, classes] = await Promise.all([
    listRooms(actor),
    listTimeSlots(actor),
    listHolidays(actor),
    listClasses(actor),
  ]);

  const holidayFields: Field[] = [
    { name: "date", label: "Ngày nghỉ", type: "date", required: true },
    { name: "reason", label: "Lý do", required: true },
    {
      name: "classId",
      label: "Áp dụng cho lớp",
      type: "select",
      options: classes.map((c) => ({ value: c.id, label: `${c.code} – ${c.name}` })),
      hint: "Không chọn = nghỉ toàn trung tâm.",
    },
  ];

  return (
    <div className="grid gap-8">
      <CrudSection
        title="Phòng học"
        numbered
        columns={["Tên phòng", "Sức chứa"]}
        rows={rooms.map((r) => ({
          id: r.id,
          cells: [r.name, String(r.capacity)],
          values: { name: r.name, capacity: String(r.capacity) },
        }))}
        fields={roomFields}
        createAction={can("add") ? createRoomAction : undefined}
        updateAction={can("edit") ? updateRoomAction : undefined}
        deleteAction={admin ? deleteRoomAction : undefined}
      />
      <CrudSection
        title="Ca học"
        numbered
        columns={["Tên ca", "Khung giờ", "Bắt đầu", "Kết thúc"]}
        mergeFirstColumn
        rows={orderSlotFrames(slots).map((s) => ({
          id: s.id,
          label: `${s.name} – Khung ${s.frame}`,
          cells: [s.name, `Khung ${s.frame}`, formatTime(s.defaultStart), formatTime(s.defaultEnd)],
          values: { name: s.name, defaultStart: formatTime(s.defaultStart), defaultEnd: formatTime(s.defaultEnd) },
        }))}
        fields={slotFields}
        createAction={can("add") ? createTimeSlotAction : undefined}
        updateAction={can("edit") ? updateTimeSlotAction : undefined}
        deleteAction={admin ? deleteTimeSlotAction : undefined}
      />
      <CrudSection
        title="Ngày nghỉ"
        columns={["Ngày", "Lý do", "Phạm vi"]}
        rows={holidays.map((h) => ({
          id: h.id,
          cells: [formatDate(h.date), h.reason, h.className ?? "Toàn trung tâm"],
          values: {},
        }))}
        fields={holidayFields}
        createAction={can("add") ? createHolidayAction : undefined}
        deleteAction={admin ? deleteHolidayAction : undefined}
      />
    </div>
  );
}
