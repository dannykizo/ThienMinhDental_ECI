---
name: gitnexus-area-domain
description: "Skill for the Domain area of Thiên Minh Dental Workforce. 7 symbols across 3 files."
---

# Domain

7 symbols | 3 files | Cohesion: 82%

## When to Use

- Working with code in `backend/`
- Understanding how assertValidGeoPoint, AttendanceRecord, contains work
- Modifying domain-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/src/modules/attendance/domain/office-geofence.ts` | toRadians, contains, distanceFromCenter, constructor |
| `backend/src/modules/attendance/domain/attendance-record.ts` | AttendanceRecord, start |
| `backend/src/modules/attendance/domain/geo-point.ts` | assertValidGeoPoint |

## Entry Points

Start here when exploring this area:

- **`assertValidGeoPoint`** (Function) — `backend/src/modules/attendance/domain/geo-point.ts:5`
- **`AttendanceRecord`** (Class) — `backend/src/modules/attendance/domain/attendance-record.ts:11`
- **`contains`** (Method) — `backend/src/modules/attendance/domain/office-geofence.ts:16`
- **`distanceFromCenter`** (Method) — `backend/src/modules/attendance/domain/office-geofence.ts:21`
- **`start`** (Method) — `backend/src/modules/attendance/domain/attendance-record.ts:22`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `AttendanceRecord` | Class | `backend/src/modules/attendance/domain/attendance-record.ts` | 11 |
| `assertValidGeoPoint` | Function | `backend/src/modules/attendance/domain/geo-point.ts` | 5 |
| `contains` | Method | `backend/src/modules/attendance/domain/office-geofence.ts` | 16 |
| `distanceFromCenter` | Method | `backend/src/modules/attendance/domain/office-geofence.ts` | 21 |
| `start` | Method | `backend/src/modules/attendance/domain/attendance-record.ts` | 22 |
| `constructor` | Method | `backend/src/modules/attendance/domain/office-geofence.ts` | 5 |
| `toRadians` | Function | `backend/src/modules/attendance/domain/office-geofence.ts` | 40 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Contains → ToRadians` | intra_community | 3 |

## How to Explore

1. `context({name: "assertValidGeoPoint"})` — see callers and callees
2. `query({search_query: "domain"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
