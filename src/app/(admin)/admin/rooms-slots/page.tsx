import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
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
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Phòng & Ca học" };

const roomFields: Field[] = [
  { name: "name", label: "Tên phòng", required: true },
  { name: "capacity", label: "Sức chứa", type: "number", required: true },
];

const slotFields: Field[] = [
  { name: "name", label: "Tên ca", required: true },
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
  const { actor } = await requirePageUser("admin");
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
        createAction={createRoomAction}
        updateAction={updateRoomAction}
        deleteAction={deleteRoomAction}
      />
      <CrudSection
        title="Ca học"
        numbered
        columns={["Tên ca", "Bắt đầu", "Kết thúc"]}
        rows={slots.map((s) => ({
          id: s.id,
          cells: [s.name, formatTime(s.defaultStart), formatTime(s.defaultEnd)],
          values: { name: s.name, defaultStart: formatTime(s.defaultStart), defaultEnd: formatTime(s.defaultEnd) },
        }))}
        fields={slotFields}
        createAction={createTimeSlotAction}
        updateAction={updateTimeSlotAction}
        deleteAction={deleteTimeSlotAction}
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
        createAction={createHolidayAction}
        deleteAction={deleteHolidayAction}
      />
    </div>
  );
}
