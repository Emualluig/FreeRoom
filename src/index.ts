interface MetaResponse {
    status: number;
    type: string;
    message: unknown|null;
    errors: unknown|null;
    datetime: unknown|null;
};
type JSONStringProperties = string;
type JSONStringOpenClassroom = string;
interface Features {
    type: string;
    properties: {
        buildingId: string;
        buildingCode: string;
        buildingName: string;
        parentBuildingCode: string|null;
        alternateBuildingNames: string|null;
        building_sections: string|null;
        youtube_vid: string|null;
        streamable_vid: string|null;
        rawPropertiesStr: JSONStringProperties;
        supportOpenClassroom: boolean;
        openClassroomSlots: JSONStringOpenClassroom;
        building_id: string;
        building_code: string;
        building_name: string;
        building_parent: string|null;
    };
    geometry: {
        coordinates: number[];
        type: string;
    }
};
interface DataResponse {
    meta: unknown|null;
    type: string;
    features: Features[];
};
interface ApiResponse {
    meta: MetaResponse;
    data: DataResponse;
};
type Weekday = "Monday"|"Tuesday"|"Wednesday"|"Thursday"|"Friday"|"Saturday"|"Sunday";
interface Slot {
    StartTime: string;
    EndTime: string;
};
interface OpenScheduleInfo {
    Weekday: Weekday;
    Slots: Slot[];
};
interface OpenRoomInfo {
    roomNumber: string;
    buildingCode: string;
    GeneratedTime: string;
    Schedule: OpenScheduleInfo[];
};
interface OpenClassroomSlots {
    lastUpdated: string;
    data: OpenRoomInfo[];
};

interface RoomSlot {
    color: number|null;
    buildingName: string;
    buildingCode: string;
    roomNumber: string;
    StartTime: string;
    EndTime: string;
    startNumber: number;
    endNumber: number;
};
interface BuildingClassrooms {
    name: string;
    code: string;
    weeklySlots: Map<Weekday, RoomSlot[]>;
};
const getTimeString = (time: string): string => {
    let [ hour, minute ] = time.split(":").map(el => parseInt(el));
    const period = hour >= 12 ? "PM" : "AM";
    if (hour >= 13) {
        hour -= 12;
    }
    return `${hour}:${String(minute).padStart(2, "0")} ${period}`;
}
const AVAILABLE_DAYS = new Set<Weekday>();
const AVAILABLE_BUILDINGS = new Set<string>();
const BUILDING_OPENCLASSROOMS = new Map<string, BuildingClassrooms>();
interface ColorInformation {
    accent: string;
    light: string;
};
const BUILDING_COLORS = new Map<string, ColorInformation>();
const randomColorInformation = (): ColorInformation => {
    const basecolor = Math.floor((360 * Math.random()));
    return {
        accent: `hsla(${basecolor}, 70%,  70%, 0.8)`,
        light: `hsla(${basecolor}, 70%,  70%, 0.5)`
    };
}
const generateColor = (buildingName: string): void => {
    if (!BUILDING_COLORS.has(buildingName)) {
        BUILDING_COLORS.set(buildingName, randomColorInformation());
    }
}

interface Constants {
    PIXELS_PER_HOUR: number|null;
    INITIAL_PIXELS: number|null;
    SLOT_WIDTH: number;
    RIGHT_MARGIN: number;
    BLOCK_CONTAINER: HTMLElement|null;
    SELECT_BUILDING: HTMLSelectElement|null;
    SELECT_WEEKDAY: HTMLSelectElement|null
};
const CONSTANTS: Constants = {
    PIXELS_PER_HOUR: null,
    INITIAL_PIXELS: null,
    SLOT_WIDTH: 175,
    RIGHT_MARGIN: 5,
    BLOCK_CONTAINER: null,
    SELECT_BUILDING: null,
    SELECT_WEEKDAY: null,
};

const url = String.raw`https://corsproxy.io/?https://portalapi2.uwaterloo.ca/v2/map/OpenClassrooms`;
const getResponse = async (): Promise<ApiResponse> => {
    try {
        const res = await fetch(url, {
            method: "GET",
        });
        return await res.json();
    } catch (e) {
        alert("Could not get data from API.");
        throw e;
    }
};
const parseOpenClassroomSlots = (data: string): OpenClassroomSlots => {
    return JSON.parse(data) as OpenClassroomSlots;
};

const htmlTemplate = (
    top: number, 
    height: number, 
    left: number,
    color: string,
    building: string,
    buildingCode: string,
    roomNumber: string,
    startTime: string,
    endTime: string
): string => {
    return `
    <div class="slot-block" style="background-color: ${color}; top: ${top}px; height: ${height}px; left: ${left}px;">
        <div class="slot-block-inner">
            <span>${buildingCode} ${roomNumber}</span>
            <span>${startTime} to ${endTime}</span>
            <span>${building}</span>
        </div>
    </div>
    `;
}

const renderSlots = (
    selectedDaysOfWeek: Weekday[], 
    selectedBuildings: Set<string>
): void => {
    const INITIAL_PIXELS = CONSTANTS.INITIAL_PIXELS;
    if (INITIAL_PIXELS === null) {
        throw new Error("Failed rendering, could not get INITIAL_PIXELS.");
    }
    const PIXELS_PER_HOUR = CONSTANTS.PIXELS_PER_HOUR;
    if (PIXELS_PER_HOUR === null) {
        throw new Error("Failed rendering, could not get PIXELS_PER_HOUR.");
    }
    const BLOCK_CONTAINER = CONSTANTS.BLOCK_CONTAINER;
    if (BLOCK_CONTAINER === null) {
        throw new Error("Failed rending, could not find BLOCK_CONATINER.");
    }
    BLOCK_CONTAINER.innerHTML = "";

    // If no rooms are selected, get them all.
    const hasSelectedRooms = selectedBuildings.size !== 0;
    const intervals: RoomSlot[] = [];

    // Get intervals based on citeria.
    for (const entry of BUILDING_OPENCLASSROOMS.entries()) {
        if (hasSelectedRooms && !selectedBuildings.has(entry[0])) {
            continue;
        }
        for (const weekday of selectedDaysOfWeek) {
            const slots = entry[1].weeklySlots.get(weekday);
            if (slots === undefined) {
                console.log("The building", entry[0], "has no available rooms on", weekday.toLowerCase(), "due to undefined value.");
                continue;
            }
            if (slots.length === 0) {
                console.log("The building", entry[0], "has no available rooms on", weekday.toLowerCase(), "due to array of length 0.");
                continue;
            }
            for (const slot of slots) {
                intervals.push(slot);
            }
        }
    }

    if (intervals.length === 0) {
        console.log("No intervals to render. Received:", selectedDaysOfWeek, selectedBuildings);
        return;
    }

    // Sort the intervals by increasing start time.
    const sortedIntervals = intervals.sort((a, b) => {
        if (a.startNumber < b.startNumber) {
            return -1;
        } else if (a.startNumber > b.startNumber) {
            return 1;
        } else {
            return 0;
        }
    });

    // GreedyIntervalColouring algorithm from CS341. I took it this semester.
    // We use interval coloring to determine which column to place the block into.
    let d = 1;
    sortedIntervals[0].color = d;
    const finish = [ sortedIntervals[0].endNumber ];
    for (let i = 0; i < sortedIntervals.length; i++) {
        let reused = false;
        for (let c = 1; c <= d; c++) {
            if (finish[c] <= sortedIntervals[i].startNumber) {
                sortedIntervals[i].color = c;
                finish[c] = sortedIntervals[i].endNumber;
                reused = true;
                break;
            }
        }
        if (!reused) {
            d += 1;
            sortedIntervals[i].color = d;
            finish[d] = sortedIntervals[i].endNumber;
        }
    }

    // Draw the intervals
    for (const interval of sortedIntervals) {
        const [ startHour, startMinute ] = interval.StartTime.split(":").map(el => parseInt(el));
        const [ endHour, endMinute ] = interval.EndTime.split(":").map(el => parseInt(el));
        if (interval.color === null) {
            throw new Error("Failed rendering, interval was not colored.");
        }
        const top = INITIAL_PIXELS + (startHour - 8 + startMinute/60) * PIXELS_PER_HOUR;
        const height = PIXELS_PER_HOUR * ((endHour - startHour) + (endMinute - startMinute)/60);
        const left = (interval.color - 2) * (CONSTANTS.SLOT_WIDTH + CONSTANTS.RIGHT_MARGIN);
        const color = BUILDING_COLORS.get(interval.buildingName) ?? randomColorInformation();
        const html = htmlTemplate(
            Math.floor(top), 
            Math.ceil(height), 
            Math.round(left),
            color.accent,
            interval.buildingName, 
            interval.buildingCode,
            interval.roomNumber,
            getTimeString(interval.StartTime),
            getTimeString(interval.EndTime)
        );
        BLOCK_CONTAINER.insertAdjacentHTML("afterbegin", html);
    }
}

const startupRender = (): void => {
    if (CONSTANTS.SELECT_BUILDING === null) {
        throw new Error("Could not find building selector.");
    }
    if (CONSTANTS.SELECT_WEEKDAY === null) {
        throw new Error("Could not find weekday selector.");
    }
    CONSTANTS.SELECT_BUILDING.insertAdjacentHTML("afterbegin", `<option value="---" selected="selected">--- any ---</option>`)
    for (const building of AVAILABLE_BUILDINGS) {
        const html = `<option value="${building}">${building}</option>`;
        CONSTANTS.SELECT_BUILDING.insertAdjacentHTML("afterbegin", html);
    }
    let index = 0;
    for (const day of AVAILABLE_DAYS) {
        const selected = index === 0 ? `selected="selected"` : "";
        const html = `<option value="${day}" ${selected}>${day}</option>`;
        CONSTANTS.SELECT_WEEKDAY.insertAdjacentHTML("afterbegin", html);
        index += 1;
    }
    CONSTANTS.SELECT_BUILDING.addEventListener("change", function () {
        const w = CONSTANTS.SELECT_WEEKDAY?.value;
        if (w === undefined) {
            throw new Error("Could not get selected weekday.");
        }
        if (this.value === "---") {
            renderSlots([w as Weekday], new Set());
        } else {
            renderSlots([w as Weekday], new Set([this.value]));
        }
    });
    CONSTANTS.SELECT_WEEKDAY.addEventListener("change", function () {
        const w = CONSTANTS.SELECT_BUILDING?.value;
        if (w === undefined) {
            throw new Error("Could not get selected weekday.");
        }
        if (w === "---") {
            renderSlots([this.value as Weekday], new Set());
        } else {
            renderSlots([this.value as Weekday], new Set([w]));
        }
    });

    const firstDay = CONSTANTS.SELECT_WEEKDAY.value as Weekday;
    renderSlots([firstDay], new Set());
}

void (async function() {
    const response: ApiResponse = await getResponse();
    if (response.meta.status !== 200) {
        console.error(response.meta);
        throw new Error("Response was not status code 200.");
    }

    for (const building of response.data.features) {
        const props = building.properties;
        const buildingName = props.buildingName;
        const buildingCode = props.buildingCode;
        const supproted = props.supportOpenClassroom;
        if (!supproted) {
            console.log(`The building ${buildingName} does not support OpenClassroom.`);
            continue;
        }
        AVAILABLE_BUILDINGS.add(buildingName);
        const openClassroomSlots = parseOpenClassroomSlots(props.openClassroomSlots);
        const buildingClassrooms: BuildingClassrooms = {
            name: buildingName,
            code: buildingCode,
            weeklySlots: new Map()
        };
        for (const openRoomInfo of openClassroomSlots.data) {
            const roomNumber = openRoomInfo.roomNumber;
            for (const schedule of openRoomInfo.Schedule) {
                const weekday = schedule.Weekday;
                AVAILABLE_DAYS.add(weekday);
                for (const slot of schedule.Slots) {
                    const map = buildingClassrooms.weeklySlots;
                    if (!map.has(weekday)) {
                        map.set(weekday, []);
                    } else {
                        map.get(weekday)?.push({
                            color: null,
                            buildingName,
                            buildingCode,
                            roomNumber,
                            StartTime: slot.StartTime,
                            EndTime: slot.EndTime,
                            startNumber: slot.StartTime.split(":").reduce((accumulator, currentValue) => accumulator * 100 + Number(currentValue), 0),
                            endNumber: slot.EndTime.split(":").reduce((accumulator, currentValue) => accumulator * 100 + Number(currentValue), 0),
                        });
                    }
                }
            }
        }
        generateColor(buildingName);
        BUILDING_OPENCLASSROOMS.set(buildingName, buildingClassrooms);
    }
    startupRender();
})();

const sleep = async (ms: number): Promise<void> => { 
    await new Promise(resolve => setTimeout(resolve, ms));
};
const clamp = (num: number, min: number, max: number): number => {
    return Math.min(Math.max(num, min), max);
};
const moveTimePointer = async (): Promise<void> => {
    const INITIAL_PIXELS = CONSTANTS.INITIAL_PIXELS;
    if (INITIAL_PIXELS === null) {
        throw new Error("Failed moving time pointer, could not get INITIAL_PIXELS.");
    }
    const PIXELS_PER_HOUR = CONSTANTS.PIXELS_PER_HOUR;
    if (PIXELS_PER_HOUR === null) {
        throw new Error("Failed moving time pointer, could not get PIXELS_PER_HOUR.");
    }
    const timePointer: HTMLDivElement|null = document.querySelector("div.time-pointer");
    if (timePointer === null) {
        throw new Error("Cannot find time-pointer.");
    }
    const timeSpan = timePointer.querySelector("span");
    if (timeSpan === null) {
        throw new Error("Cannot find time-span indicator.");
    }
    const formatter = new Intl.DateTimeFormat([], { 
        timeZone: "America/Toronto",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h24"
    });
    const tpMidPoint = timePointer.getBoundingClientRect().height/2;
    while (true) {
        const timeText = formatter.format(new Date());
        const [ hour, minute ] = timeText.split(":").map(el => parseInt(el));
        const top = (hour - 8 + minute/60) * PIXELS_PER_HOUR + INITIAL_PIXELS - tpMidPoint;
        const clamped = clamp(top, INITIAL_PIXELS/2 - 1, 761);
        timePointer.style.setProperty("top", `${clamped}px`);
        timeSpan.innerText = getTimeString(timeText);
        await sleep(1 * 60 * 1000); // Wait 1 minute
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const PIXELS_PER_HOUR = document.querySelector("div.day-time>div.time-row")?.getBoundingClientRect().height;
    if (PIXELS_PER_HOUR === undefined) {
        throw new Error("Could not find required div.time-row HTMLElement.");
    }
    CONSTANTS.PIXELS_PER_HOUR = PIXELS_PER_HOUR;
    CONSTANTS.INITIAL_PIXELS = PIXELS_PER_HOUR/2;
    CONSTANTS.BLOCK_CONTAINER = document.querySelector("div.day-blocks>div.block-container");
    CONSTANTS.SELECT_BUILDING = document.querySelector("select#buildings-selector");
    CONSTANTS.SELECT_WEEKDAY = document.querySelector("select#weekday-selector");
    void moveTimePointer();
});