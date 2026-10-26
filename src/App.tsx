import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Droplets,
  Leaf,
  Plus,
  Search,
  Sprout,
  Sun,
  X,
} from "lucide-react";

type Screen = "plants" | "reminders" | "guide";
type CareKind = "water" | "repot";
type Plant = {
  id: string;
  name: string;
  photo?: string;
  wateringInterval: number;
  repotInterval: number;
  lastWateredAt: string;
  lastRepotCheckAt: string;
};
type CareTask = {
  id: string;
  plantId: string;
  plantName: string;
  kind: CareKind;
  due: Date;
};

const STORAGE_KEY = "plantcare.plants.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, days: number): Date {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date;
}

function addMonths(dateString: string, months: number): Date {
  const date = new Date(`${dateString}T12:00:00`);
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en", options ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function relativeDue(date: Date): string {
  const difference = Math.round((atMidnight(date).getTime() - atMidnight(new Date()).getTime()) / DAY_MS);
  if (difference < 0) return `${Math.abs(difference)} ${Math.abs(difference) === 1 ? "day" : "days"} overdue`;
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference < 7) return `In ${difference} days`;
  if (difference < 14) return "Next week";
  return formatDate(date, { day: "numeric", month: "short" });
}

function createSamples(): Plant[] {
  const today = toDateInput(new Date());
  const daysAgo = (days: number) => toDateInput(addDays(today, -days));
  const monthsAgo = (months: number) => toDateInput(addMonths(today, -months));
  return [
    {
      id: "sample-monstera",
      name: "Monstera",
      wateringInterval: 7,
      repotInterval: 6,
      lastWateredAt: daysAgo(7),
      lastRepotCheckAt: monthsAgo(5),
    },
    {
      id: "sample-aloe",
      name: "Aloe Vera",
      wateringInterval: 14,
      repotInterval: 12,
      lastWateredAt: daysAgo(7),
      lastRepotCheckAt: monthsAgo(11),
    },
    {
      id: "sample-golden-pothos",
      name: "Golden Pothos",
      wateringInterval: 7,
      repotInterval: 6,
      lastWateredAt: daysAgo(10),
      lastRepotCheckAt: monthsAgo(6),
    },
  ];
}

function isPlant(value: unknown): value is Plant {
  if (!value || typeof value !== "object") return false;
  const plant = value as Record<string, unknown>;
  return (
    typeof plant.id === "string" &&
    typeof plant.name === "string" &&
    typeof plant.wateringInterval === "number" &&
    typeof plant.repotInterval === "number" &&
    typeof plant.lastWateredAt === "string" &&
    typeof plant.lastRepotCheckAt === "string" &&
    (plant.photo === undefined || typeof plant.photo === "string")
  );
}

function loadPlants(): { plants: Plant[]; error: string | null } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return { plants: createSamples(), error: null };
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every(isPlant)) {
      return { plants: createSamples(), error: "Saved plant data could not be read. Sample plants are shown; saving will replace the invalid data." };
    }
    return { plants: parsed, error: null };
  } catch (error) {
    console.error("Unable to load PlantCare data from localStorage.", error);
    return { plants: createSamples(), error: "Saved plant data could not be loaded. Sample plants are shown; changes may not be saved." };
  }
}

function getTasks(plants: Plant[]): CareTask[] {
  return plants.flatMap((plant) => [
    {
      id: `${plant.id}-water`,
      plantId: plant.id,
      plantName: plant.name,
      kind: "water" as const,
      due: addDays(plant.lastWateredAt, plant.wateringInterval),
    },
    {
      id: `${plant.id}-repot`,
      plantId: plant.id,
      plantName: plant.name,
      kind: "repot" as const,
      due: addMonths(plant.lastRepotCheckAt, plant.repotInterval),
    },
  ]);
}

function App() {
  const [initialData] = useState(loadPlants);
  const [plants, setPlants] = useState<Plant[]>(initialData.plants);
  const [storageError, setStorageError] = useState<string | null>(initialData.error);
  const [screen, setScreen] = useState<Screen>("plants");
  const [previousScreen, setPreviousScreen] = useState<Screen>("plants");
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlantId, setEditingPlantId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (plants === initialData.plants) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
      setStorageError(null);
    } catch (error) {
      console.error("Unable to save PlantCare data to localStorage.", error);
      setStorageError("Your changes are visible now but could not be saved in this browser.");
    }
  }, [plants]);

  const tasks = useMemo(() => getTasks(plants), [plants]);
  const selectedPlant = plants.find((plant) => plant.id === selectedPlantId) ?? null;
  const visiblePlants = plants.filter((plant) => plant.name.toLowerCase().includes(searchQuery.toLowerCase()));

  function openPlant(plantId: string) {
    setPreviousScreen(screen);
    setSelectedPlantId(plantId);
  }

  function goToScreen(nextScreen: Screen) {
    setScreen(nextScreen);
    setSelectedPlantId(null);
    setSearchQuery("");
  }

  function openAddPlant() {
    setEditingPlantId(null);
    setFormOpen(true);
  }

  function openEditPlant(plant: Plant) {
    setEditingPlantId(plant.id);
    setFormOpen(true);
  }

  function savePlant(values: Omit<Plant, "id">) {
    if (editingPlantId) {
      setPlants((current) => current.map((plant) => (plant.id === editingPlantId ? { ...plant, ...values } : plant)));
      setNotice("Care schedule updated.");
    } else {
      const newPlant: Plant = { ...values, id: crypto.randomUUID() };
      setPlants((current) => [...current, newPlant]);
      setSelectedPlantId(newPlant.id);
      setNotice(`${newPlant.name} was added to My Plants.`);
    }
    setFormOpen(false);
    setScreen("plants");
  }

  function completeTask(task: CareTask) {
    const today = toDateInput(new Date());
    setPlants((current) =>
      current.map((plant) =>
        plant.id !== task.plantId
          ? plant
          : task.kind === "water"
            ? { ...plant, lastWateredAt: today }
            : { ...plant, lastRepotCheckAt: today },
      ),
    );
    setNotice(task.kind === "water" ? `${task.plantName} marked as watered.` : `${task.plantName}'s repotting check is complete.`);
  }

  const selectedPlantTasks = selectedPlant ? tasks.filter((task) => task.plantId === selectedPlant.id) : [];
  const overdueCount = tasks.filter((task) => atMidnight(task.due) < atMidnight(new Date())).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); goToScreen("plants"); }}>
          <span className="brand-mark"><Sprout size={21} strokeWidth={2.1} /></span>
          <span>plantcare<span className="brand-period">.</span></span>
        </a>
        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <NavButton active={screen === "plants" && !selectedPlant} icon={<Leaf size={18} />} label="My Plants" onClick={() => goToScreen("plants")} />
          <NavButton active={screen === "reminders"} icon={<Bell size={18} />} label="Reminders" badge={overdueCount > 0 ? String(overdueCount) : undefined} onClick={() => goToScreen("reminders")} />
          <NavButton active={screen === "guide"} icon={<BookOpen size={18} />} label="Care Guide" onClick={() => goToScreen("guide")} />
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip">
          <div className="tip-icon"><Sun size={18} /></div>
          <p className="tip-title">A little care goes a long way</p>
          <p className="tip-copy">Check in with your plants as you go. They’ll show you what they need.</p>
        </div>
        <div className="profile">
          <div className="avatar">Y</div>
          <div><strong>Your garden</strong><span>{plants.length} {plants.length === 1 ? "plant" : "plants"}</span></div>
          <ChevronDown size={16} className="profile-chevron" />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>{screen === "plants" ? "MY SPACE" : screen === "reminders" ? "YOUR ROUTINE" : "LEARN & GROW"}</span>
            <ChevronRight size={13} />
            <strong>{selectedPlant ? selectedPlant.name : screen === "plants" ? "My Plants" : screen === "reminders" ? "Reminders" : "Care Guide"}</strong>
          </div>
          <div className="topbar-right">
            <span className="today-label">{formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</span>
            <button className="icon-button search-toggle" aria-label="Search plants" onClick={() => { goToScreen("plants"); document.getElementById("plant-search")?.focus(); }}><Search size={18} /></button>
            <button className="icon-button notification-button" aria-label={`Reminders${overdueCount > 0 ? `, ${overdueCount} overdue` : ""}`} onClick={() => goToScreen("reminders")}><Bell size={18} />{overdueCount > 0 && <span className="notification-dot" />}</button>
          </div>
        </header>

        {storageError && <div className="storage-alert" role="alert">{storageError}</div>}
        {notice && <div className="toast" role="status"><CircleCheck size={17} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15} /></button></div>}

        {selectedPlant ? (
          <PlantDetail
            plant={selectedPlant}
            tasks={selectedPlantTasks}
            onBack={() => setSelectedPlantId(null)}
            backLabel={previousScreen === "reminders" ? "Back to Reminders" : "Back to My Plants"}
            onWater={() => completeTask(selectedPlantTasks.find((task) => task.kind === "water")!)}
            onEdit={() => openEditPlant(selectedPlant)}
            onOpenGuide={() => goToScreen("guide")}
          />
        ) : screen === "plants" ? (
          <Home
            plants={visiblePlants}
            allPlantCount={plants.length}
            tasks={tasks}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onOpenPlant={openPlant}
            onAdd={openAddPlant}
            onReminders={() => goToScreen("reminders")}
            onCompleteTask={completeTask}
          />
        ) : screen === "reminders" ? (
          <Reminders tasks={tasks} onOpenPlant={openPlant} onCompleteTask={completeTask} />
        ) : (
          <CareGuide />
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavButton active={screen === "plants" && !selectedPlant} icon={<Leaf size={19} />} label="Plants" onClick={() => goToScreen("plants")} />
        <NavButton active={screen === "reminders"} icon={<Bell size={19} />} label="Reminders" onClick={() => goToScreen("reminders")} />
        <NavButton active={screen === "guide"} icon={<BookOpen size={19} />} label="Guide" onClick={() => goToScreen("guide")} />
      </nav>

      {formOpen && (
        <PlantForm
          plant={editingPlantId ? plants.find((plant) => plant.id === editingPlantId) : undefined}
          onClose={() => setFormOpen(false)}
          onSave={savePlant}
        />
      )}
    </div>
  );
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: string; onClick: () => void }) {
  return (
    <button className={`nav-item${active ? " active" : ""}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span><span>{label}</span>{badge && <span className="nav-badge">{badge}</span>}
    </button>
  );
}

function PageHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: React.ReactNode; copy: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{copy}</p></div>
      {action}
    </div>
  );
}

function Home({
  plants, allPlantCount, tasks, searchQuery, onSearch, onOpenPlant, onAdd, onReminders, onCompleteTask,
}: {
  plants: Plant[]; allPlantCount: number; tasks: CareTask[]; searchQuery: string;
  onSearch: (value: string) => void; onOpenPlant: (id: string) => void; onAdd: () => void;
  onReminders: () => void; onCompleteTask: (task: CareTask) => void;
}) {
  const todayTasks = tasks.filter((task) => atMidnight(task.due) <= atMidnight(new Date()));
  const overdueTasks = todayTasks.filter((task) => atMidnight(task.due) < atMidnight(new Date()));
  return (
    <div className="page">
      <PageHeading
        eyebrow="YOUR LITTLE INDOOR JUNGLE"
        title={<>Make room to <em>grow.</em></>}
        copy="A calm corner for keeping your plants happy and healthy."
        action={<button className="button button-primary heading-action" onClick={onAdd}><Plus size={17} />Add a plant</button>}
      />
      <section className="dashboard-grid">
        <div className="main-column">
          <section className="panel today-panel">
            <div className="section-heading">
              <div><div className="eyebrow">DAILY CHECK-IN</div><h2>Today’s care</h2></div>
              <button className="text-link" onClick={onReminders}>All reminders <ArrowRight size={15} /></button>
            </div>
            {todayTasks.length ? (
              <div className="today-task-list">
                {todayTasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} onOpen={() => onOpenPlant(task.plantId)} onComplete={() => onCompleteTask(task)} compact />)}
              </div>
            ) : (
              <div className="empty-today"><span className="empty-icon"><CircleCheck size={20} /></span><div><strong>All caught up</strong><p>No care tasks due right now. Take a moment to enjoy your plants.</p></div></div>
            )}
            <div className="today-footer"><span>{overdueTasks.length > 0 ? `${overdueTasks.length} task${overdueTasks.length === 1 ? "" : "s"} overdue` : todayTasks.length > 0 ? `${todayTasks.length} care task${todayTasks.length === 1 ? "" : "s"} due today` : "Nothing due today"}</span><span className="task-progress">Every little check-in helps</span></div>
          </section>

          <div className="plant-section-header">
            <div><div className="eyebrow">GROWING TOGETHER</div><h2>Your plants <span className="count-pill">{allPlantCount}</span></h2></div>
            <label className="search-field"><Search size={16} /><input id="plant-search" value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="Find a plant" aria-label="Search plants" /></label>
          </div>
          {plants.length ? (
            <div className="plant-grid">
              {plants.map((plant, index) => <PlantCard key={plant.id} plant={plant} tasks={tasks.filter((task) => task.plantId === plant.id)} index={index} onClick={() => onOpenPlant(plant.id)} />)}
              <button className="add-plant-card" onClick={onAdd}><span className="add-card-icon"><Plus size={20} /></span><strong>Add another plant</strong><span>There’s always room for one more.</span></button>
            </div>
          ) : (
            <div className="empty-state"><Sprout size={30} /><h3>{searchQuery ? "No plants found" : "Your garden starts here"}</h3><p>{searchQuery ? "Try another name or clear your search." : "Add a plant to start keeping track of its care."}</p>{!searchQuery && <button className="button button-primary" onClick={onAdd}><Plus size={16} />Add your first plant</button>}</div>
          )}
          <div className="sample-note"><span className="sample-dot" />Sample plants are ready to explore. Add your own whenever you like.</div>
        </div>
        <aside className="right-column">
          <div className="season-card">
            <div className="season-art"><Sun size={20} /><span className="sun-orbit" /><span className="plant-silhouette">✿</span></div>
            <span className="season-label">A NOTE FOR TODAY</span>
            <h3>Go slow with the water.</h3>
            <p>Check the soil first. If the top feels dry, your plant might be ready for a drink.</p>
            <span className="season-signoff">Little by little <span>✳</span></span>
          </div>
          <div className="quick-guide panel">
            <div className="quick-guide-icon"><BookOpen size={18} /></div>
            <div className="eyebrow">A GENTLE REMINDER</div>
            <h3>Plants have their own pace.</h3>
            <p>Care schedules are a helpful starting point—not a rule. Light, season, and soil all make a difference.</p>
            <button className="text-link" onClick={onReminders}>See your routine <ArrowRight size={15} /></button>
          </div>
        </aside>
      </section>
    </div>
  );
}

function PlantCard({ plant, tasks, index, onClick }: { plant: Plant; tasks: CareTask[]; index: number; onClick: () => void }) {
  const nextWater = tasks.find((task) => task.kind === "water")?.due ?? new Date();
  const hues = ["sage", "clay", "moss", "butter"];
  return (
    <button className="plant-card" onClick={onClick}>
      <div className={`plant-card-visual ${hues[index % hues.length]}`}>
        {plant.photo ? <img src={plant.photo} alt={plant.name} /> : <PlantIllustration index={index} />}
        <span className="plant-card-open"><ArrowRight size={16} /></span>
      </div>
      <div className="plant-card-copy">
        <div><h3>{plant.name}</h3><span className="plant-type">{index === 0 ? "Leafy friend" : index === 1 ? "Sun lover" : "Easy-going"}</span></div>
        <span className={`care-status ${atMidnight(nextWater) < atMidnight(new Date()) ? "status-overdue" : atMidnight(nextWater) <= atMidnight(new Date()) ? "status-today" : "status-upcoming"}`}>
          <Droplets size={13} />{relativeDue(nextWater)}
        </span>
      </div>
      <div className="plant-card-next">Next water <strong>{formatDate(nextWater, { day: "numeric", month: "short" })}</strong></div>
    </button>
  );
}

function PlantIllustration({ index }: { index: number }) {
  const variant = index % 3;
  const potColor = ["#c78e6e", "#d2a074", "#bb8767"][variant];

  return (
    <svg className={`plant-illustration plant-illustration-${variant}`} viewBox="0 0 260 240" aria-hidden="true" focusable="false">
      <ellipse cx="130" cy="221" rx="54" ry="7" fill="#52684d" opacity=".09" />
      {variant === 0 ? (
        <g>
          <g fill="none" stroke="#66836a" strokeLinecap="round" strokeWidth="3">
            <path d="M130 202 C126 155 101 130 91 85" /><path d="M132 202 C138 151 155 123 175 75" />
            <path d="M128 202 C119 164 77 155 64 126" /><path d="M133 202 C151 161 188 151 196 120" />
          </g>
          <g transform="translate(80 17) rotate(-15 40 47)">
            <path d="M10 86 C3 66 8 40 27 20 C40 7 54 3 70 6 C87 10 96 23 95 38 C94 45 89 48 89 55 C89 62 96 65 93 73 C88 89 69 97 48 96 C31 96 18 92 10 86 Z M42 33 C42 25 51 25 51 33 L51 42 C51 49 42 49 42 42 Z M69 52 C69 44 78 44 78 52 L78 61 C78 68 69 68 69 61 Z M31 62 C31 55 39 55 39 62 L39 69 C39 76 31 76 31 69 Z" fill="#6f9273" fillRule="evenodd" />
            <path d="M14 87 C36 69 53 42 67 13 M35 67 L25 47 M52 43 L49 29 M66 34 L83 30 M46 56 L62 62 M25 78 L16 68 M72 70 L87 67" fill="none" stroke="#c4d1ae" strokeLinecap="round" strokeWidth="2" opacity=".78" />
          </g>
          <g transform="translate(142 43) rotate(23 33 43) scale(.82)">
            <path d="M10 86 C3 66 8 40 27 20 C40 7 54 3 70 6 C87 10 96 23 95 38 C94 45 89 48 89 55 C89 62 96 65 93 73 C88 89 69 97 48 96 C31 96 18 92 10 86 Z M42 33 C42 25 51 25 51 33 L51 42 C51 49 42 49 42 42 Z M69 52 C69 44 78 44 78 52 L78 61 C78 68 69 68 69 61 Z M31 62 C31 55 39 55 39 62 L39 69 C39 76 31 76 31 69 Z" fill="#8da47d" fillRule="evenodd" />
            <path d="M14 87 C36 69 53 42 67 13 M35 67 L25 47 M52 43 L49 29 M66 34 L83 30 M46 56 L62 62" fill="none" stroke="#d5dfc5" strokeLinecap="round" strokeWidth="2.3" opacity=".78" />
          </g>
          <g transform="translate(47 83) rotate(-43 28 35) scale(.7)">
            <path d="M10 86 C3 66 8 40 27 20 C40 7 54 3 70 6 C87 10 96 23 95 38 C94 45 89 48 89 55 C89 62 96 65 93 73 C88 89 69 97 48 96 C31 96 18 92 10 86 Z M42 33 C42 25 51 25 51 33 L51 42 C51 49 42 49 42 42 Z M69 52 C69 44 78 44 78 52 L78 61 C78 68 69 68 69 61 Z M31 62 C31 55 39 55 39 62 L39 69 C39 76 31 76 31 69 Z" fill="#537d63" fillRule="evenodd" />
            <path d="M14 87 C36 69 53 42 67 13 M35 67 L25 47 M52 43 L49 29 M66 34 L83 30" fill="none" stroke="#b8cda8" strokeLinecap="round" strokeWidth="2.5" opacity=".78" />
          </g>
          <g transform="translate(171 93) rotate(40 28 35) scale(.68)">
            <path d="M10 86 C3 66 8 40 27 20 C40 7 54 3 70 6 C87 10 96 23 95 38 C94 45 89 48 89 55 C89 62 96 65 93 73 C88 89 69 97 48 96 C31 96 18 92 10 86 Z M42 33 C42 25 51 25 51 33 L51 42 C51 49 42 49 42 42 Z M69 52 C69 44 78 44 78 52 L78 61 C78 68 69 68 69 61 Z M31 62 C31 55 39 55 39 62 L39 69 C39 76 31 76 31 69 Z" fill="#75967a" fillRule="evenodd" />
            <path d="M14 87 C36 69 53 42 67 13 M35 67 L25 47 M52 43 L49 29 M66 34 L83 30" fill="none" stroke="#cad6b8" strokeLinecap="round" strokeWidth="2.5" opacity=".78" />
          </g>
        </g>
      ) : variant === 1 ? (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M130 203 C105 160 80 119 60 63 C90 77 112 120 130 203Z" fill="#789a73" stroke="#58795d" strokeWidth="2" />
          <path d="M130 203 C116 150 113 96 123 27 C147 70 146 132 130 203Z" fill="#91aa7d" stroke="#648262" strokeWidth="2" />
          <path d="M130 203 C132 142 154 84 194 43 C187 103 161 155 130 203Z" fill="#6b8c67" stroke="#557656" strokeWidth="2" />
          <path d="M130 203 C146 153 184 119 218 101 C206 150 169 185 130 203Z" fill="#9bb286" stroke="#668363" strokeWidth="2" />
          <path d="M130 203 C111 157 78 133 43 127 C57 167 94 193 130 203Z" fill="#668965" stroke="#4f7055" strokeWidth="2" />
          <path d="M130 203 C126 150 104 109 88 80 M130 203 C126 135 126 82 123 43 M130 203 C148 146 169 99 185 62 M130 203 C156 159 184 131 205 116 M130 203 C110 167 79 145 56 136" stroke="#c6d4ae" strokeWidth="2" opacity=".8" />
        </g>
      ) : (
        <g>
          <path d="M127 197 C113 151 123 118 91 87 C63 60 74 35 62 22 M128 198 C139 158 166 140 178 106 C190 73 171 48 189 28 M127 199 C109 164 78 157 56 129 C40 107 51 90 40 76 M132 197 C154 166 181 162 205 138 C223 120 212 102 227 91" fill="none" stroke="#638266" strokeLinecap="round" strokeWidth="3" />
          <g transform="translate(42 21) rotate(-24)">
            <path d="M0 27 C-19 7 -43 12 -43 32 C-43 49 -18 63 0 81 C18 63 43 49 43 32 C43 12 19 7 0 27Z" fill="#719273" />
            <path d="M0 77 C0 57 0 40 0 28 M0 49 L-20 34 M0 58 L19 39" fill="none" stroke="#bed0af" strokeLinecap="round" strokeWidth="2" />
          </g>
          <g transform="translate(189 27) rotate(25) scale(.82)">
            <path d="M0 27 C-19 7 -43 12 -43 32 C-43 49 -18 63 0 81 C18 63 43 49 43 32 C43 12 19 7 0 27Z" fill="#91a981" />
            <path d="M0 77 C0 57 0 40 0 28 M0 49 L-20 34 M0 58 L19 39" fill="none" stroke="#d1ddc1" strokeLinecap="round" strokeWidth="2.2" />
          </g>
          <g transform="translate(42 78) rotate(-37) scale(.72)">
            <path d="M0 27 C-19 7 -43 12 -43 32 C-43 49 -18 63 0 81 C18 63 43 49 43 32 C43 12 19 7 0 27Z" fill="#547c63" />
            <path d="M0 77 C0 57 0 40 0 28 M0 49 L-20 34 M0 58 L19 39" fill="none" stroke="#b7cda7" strokeLinecap="round" strokeWidth="2.4" />
          </g>
          <g transform="translate(207 87) rotate(33) scale(.72)">
            <path d="M0 27 C-19 7 -43 12 -43 32 C-43 49 -18 63 0 81 C18 63 43 49 43 32 C43 12 19 7 0 27Z" fill="#7d9a76" />
            <path d="M0 77 C0 57 0 40 0 28 M0 49 L-20 34 M0 58 L19 39" fill="none" stroke="#c9d8b9" strokeLinecap="round" strokeWidth="2.4" />
          </g>
          <g transform="translate(89 101) rotate(-32) scale(.64)">
            <path d="M0 27 C-19 7 -43 12 -43 32 C-43 49 -18 63 0 81 C18 63 43 49 43 32 C43 12 19 7 0 27Z" fill="#9aab82" />
            <path d="M0 77 C0 57 0 40 0 28 M0 49 L-20 34 M0 58 L19 39" fill="none" stroke="#dae0c9" strokeLinecap="round" strokeWidth="2.5" />
          </g>
        </g>
      )}
      <path d="M98 190 H162 L156 222 Q130 230 104 222Z" fill={potColor} />
      <path d="M98 190 H162 L159 199 H101Z" fill={potColor} opacity=".72" />
      <path d="M94 185 Q130 180 166 185 L163 198 Q130 202 97 198Z" fill="#b77e61" />
      <path d="M101 188 Q130 184 159 188" fill="none" stroke="#d6a083" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function TaskRow({ task, onOpen, onComplete, compact = false }: { task: CareTask; onOpen: () => void; onComplete: () => void; compact?: boolean }) {
  const isOverdue = atMidnight(task.due) < atMidnight(new Date());
  const title = task.kind === "water" ? "Water" : "Check for repotting";
  return (
    <div className={`task-row${compact ? " compact" : ""}`}>
      <button className="task-icon-button" aria-label={`Complete ${title.toLowerCase()} for ${task.plantName}`} onClick={onComplete}><Check size={14} /></button>
      <button className="task-main" onClick={onOpen}>
        <strong>{title} <span>{task.plantName}</span></strong>
        <span className="task-meta">{formatDate(task.due, { day: "numeric", month: "short" })}{isOverdue ? " · Past due" : atMidnight(task.due) <= atMidnight(new Date()) ? " · Due today" : ""}</span>
      </button>
      <span className={`task-due ${isOverdue ? "overdue-text" : ""}`}>{relativeDue(task.due)}</span>
      {!compact && <ChevronRight className="task-chevron" size={16} />}
    </div>
  );
}

function PlantDetail({ plant, tasks, onBack, backLabel, onWater, onEdit, onOpenGuide }: {
  plant: Plant; tasks: CareTask[]; onBack: () => void; backLabel: string; onWater: () => void; onEdit: () => void; onOpenGuide: () => void;
}) {
  const waterTask = tasks.find((task) => task.kind === "water")!;
  const repotTask = tasks.find((task) => task.kind === "repot")!;
  const index = ["sample-monstera", "sample-aloe", "sample-golden-pothos"].indexOf(plant.id);
  return (
    <div className="page detail-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={16} />{backLabel}</button>
      <PageHeading eyebrow="GET TO KNOW YOUR PLANT" title={<>{plant.name}<span className="heading-emoji"> ✿</span></>} copy="A little attention, a lot of new leaves." action={<button className="button button-secondary heading-action" onClick={onEdit}>Edit care schedule</button>} />
      <div className="detail-layout">
        <div className={`detail-hero ${["sage", "clay", "moss"][Math.max(index, 0) % 3]}`}>
          {plant.photo ? <img src={plant.photo} alt={plant.name} /> : <PlantIllustration index={Math.max(index, 0)} />}
          <div className="detail-hero-label"><span className="status-live-dot" />IN YOUR GARDEN</div>
        </div>
        <div className="detail-main">
          <section className="panel schedule-panel">
            <div className="section-heading"><div><div className="eyebrow">YOUR CARE RHYTHM</div><h2>Next up</h2></div><span className="schedule-sparkle">✳</span></div>
            <div className="schedule-item">
              <span className="schedule-icon water-icon"><Droplets size={18} /></span>
              <div className="schedule-text"><strong>Watering</strong><span>Every {plant.wateringInterval} days · check soil first</span></div>
              <div className="schedule-date"><strong>{formatDate(waterTask.due, { day: "numeric", month: "short" })}</strong><span>{relativeDue(waterTask.due)}</span></div>
            </div>
            <div className="schedule-item">
              <span className="schedule-icon repot-icon"><Sprout size={18} /></span>
              <div className="schedule-text"><strong>Repotting check</strong><span>Every {plant.repotInterval} months · look for crowded roots</span></div>
              <div className="schedule-date"><strong>{formatDate(repotTask.due, { day: "numeric", month: "short" })}</strong><span>{relativeDue(repotTask.due)}</span></div>
            </div>
            <button className="button button-primary water-button" onClick={onWater}><Droplets size={17} />Mark as watered</button>
          </section>
          <section className="panel care-notes">
            <div className="eyebrow">A FEW THINGS TO KNOW</div>
            <CareNote icon={<Droplets size={17} />} title="Watering" copy="Let the top 2–3 cm of soil dry before watering. Water thoroughly, then let excess drain away." />
            <CareNote icon={<Sun size={17} />} title="Light" copy="Bright, indirect light is a lovely place to start. Avoid harsh direct afternoon sun." />
            <CareNote icon={<Sprout size={17} />} title="Soil & repotting" copy="Use a well-draining potting mix. Check roots occasionally; repot only when they seem crowded." />
            <button className="text-link" onClick={onOpenGuide}>Explore the care guide <ArrowRight size={15} /></button>
          </section>
        </div>
      </div>
    </div>
  );
}

function CareNote({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="care-note"><span className="care-note-icon">{icon}</span><div><strong>{title}</strong><p>{copy}</p></div></div>;
}

function Reminders({ tasks, onOpenPlant, onCompleteTask }: { tasks: CareTask[]; onOpenPlant: (id: string) => void; onCompleteTask: (task: CareTask) => void }) {
  const groups = [
    { title: "Overdue", className: "reminder-overdue", items: tasks.filter((task) => atMidnight(task.due) < atMidnight(new Date())) },
    { title: "Today", className: "reminder-today", items: tasks.filter((task) => atMidnight(task.due).getTime() === atMidnight(new Date()).getTime()) },
    { title: "Coming up", className: "reminder-upcoming", items: tasks.filter((task) => atMidnight(task.due) > atMidnight(new Date())).sort((a, b) => a.due.getTime() - b.due.getTime()) },
  ];
  const overdueCount = groups[0].items.length;
  return (
    <div className="page reminders-page">
      <PageHeading eyebrow="A ROUTINE THAT FLEXES WITH YOU" title={<>Your care, <em>at a glance.</em></>} copy="Check in when it works for you. Your plants aren’t keeping score." />
      <div className="reminders-intro panel">
        <div className="reminders-intro-icon"><Bell size={20} /></div>
        <div><strong>{overdueCount ? `${overdueCount} task${overdueCount === 1 ? "" : "s"} could use a little love` : "You’re right on track"}</strong><p>{overdueCount ? "No need to rush—start with a quick check of the soil." : "Your reminders are here whenever you need them."}</p></div>
        <span className="reminders-leaf">✿</span>
      </div>
      <div className="reminders-content">
        {groups.map((group) => (
          <section className={`reminder-group ${group.className}`} key={group.title}>
            <div className="reminder-group-title"><span className="group-marker" /><h2>{group.title}</h2><span>{group.items.length}</span></div>
            {group.items.length ? (
              <div className="panel reminder-list">{group.items.map((task) => <TaskRow key={task.id} task={task} onOpen={() => onOpenPlant(task.plantId)} onComplete={() => onCompleteTask(task)} />)}</div>
            ) : <p className="group-empty">{group.title === "Overdue" ? "Nothing waiting on you." : group.title === "Today" ? "A quiet day in your garden." : "No upcoming tasks just yet."}</p>}
          </section>
        ))}
      </div>
      <p className="reminders-footnote"><Bell size={14} />In-app reminders only. Care schedules stay flexible—always check your plant and soil.</p>
    </div>
  );
}

function CareGuide() {
  return (
    <div className="page guide-page">
      <PageHeading eyebrow="A FRIENDLY PLACE TO START" title={<>Learn as you <em>grow.</em></>} copy="Every plant is a little different. Let its leaves, soil, and surroundings guide you." />
      <div className="guide-intro">
        <div className="guide-intro-mark"><Sprout size={25} /></div>
        <div><strong>There’s no one-size-fits-all routine.</strong><p>Think of these tips as gentle starting points. Season, pot, light, and your home all play a part.</p></div>
        <span className="guide-intro-flower">✿</span>
      </div>
      <div className="guide-grid">
        <GuideCard number="01" icon={<Droplets size={20} />} title="Watering" tag="Start with the soil" copy={<>Feel the top 2–3 cm of soil before reaching for the watering can. If it’s still damp, give it more time. When it feels dry, water slowly until a little drains out the bottom.</>} extra="Your plant’s needs change with light, season, and pot size—so use a schedule as a reminder to check, not an instruction to water." color="guide-green" />
        <GuideCard number="02" icon={<Sun size={20} />} title="Light" tag="Notice where the sun lands" copy={<>Bright, indirect light is a good starting point for many houseplants. A spot near a window—but out of the harsh midday rays—often works well.</>} extra="Pale, stretched growth can mean it wants more light. Crispy or scorched patches may mean the sun is too strong." color="guide-yellow" />
        <GuideCard number="03" icon={<Sprout size={20} />} title="Soil" tag="Let excess water escape" copy={<>Most houseplants appreciate a pot with drainage holes and a mix that lets extra water flow through rather than sit around their roots.</>} extra="If soil stays soggy for days, check drainage and try letting it dry a little longer between waterings." color="guide-clay" />
        <GuideCard number="04" icon={<Leaf size={20} />} title="Repotting" tag="Look for the signs" copy={<>Check the roots through the drainage holes or gently slide the root ball out. A crowded tangle of roots or soil that dries unusually fast can mean it’s time.</>} extra="Choose a pot only a little bigger than the current one. A calendar check can remind you to look—but the plant tells you when." color="guide-lilac" />
      </div>
      <div className="guide-footer"><span>✳</span><div><strong>Get curious, not perfect.</strong><p>Not sure what you’re seeing? Compare a few trusted plant-specific sources and see what fits your plant’s conditions.</p></div></div>
    </div>
  );
}

function GuideCard({ number, icon, title, tag, copy, extra, color }: { number: string; icon: React.ReactNode; title: string; tag: string; copy: React.ReactNode; extra: string; color: string }) {
  return (
    <article className={`guide-card ${color}`}>
      <div className="guide-card-top"><span className="guide-card-icon">{icon}</span><span className="guide-number">{number}</span></div>
      <span className="guide-card-tag">{tag}</span><h2>{title}</h2><p>{copy}</p><div className="guide-card-extra">{extra}</div>
    </article>
  );
}

function PlantForm({ plant, onClose, onSave }: { plant?: Plant; onClose: () => void; onSave: (values: Omit<Plant, "id">) => void }) {
  const [name, setName] = useState(plant?.name ?? "");
  const [watering, setWatering] = useState(String(plant?.wateringInterval ?? 7));
  const [repot, setRepot] = useState(String(plant?.repotInterval ?? 6));
  const [lastWatered, setLastWatered] = useState(plant?.lastWateredAt ?? toDateInput(new Date()));
  const [lastRepotCheck, setLastRepotCheck] = useState(plant?.lastRepotCheckAt ?? toDateInput(new Date()));
  const [photo, setPhoto] = useState<string | undefined>(plant?.photo);
  const [error, setError] = useState("");

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Please choose an image smaller than 2 MB.");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("The selected photo could not be read."));
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The selected photo could not be read."));
        reader.readAsDataURL(file);
      });
      setPhoto(data);
      setError("");
    } catch (cause) {
      console.error("Unable to read selected plant photo.", cause);
      setError("The selected photo could not be read. Please try another image.");
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wateringDays = Number(watering);
    const repotMonths = Number(repot);
    if (!name.trim()) {
      setError("Add a name for your plant.");
      return;
    }
    if (!Number.isInteger(wateringDays) || wateringDays < 1 || wateringDays > 365) {
      setError("Choose a watering check-in between 1 and 365 days.");
      return;
    }
    if (!Number.isInteger(repotMonths) || repotMonths < 1 || repotMonths > 60) {
      setError("Choose a repotting check-in between 1 and 60 months.");
      return;
    }
    onSave({
      name: name.trim(),
      photo,
      wateringInterval: wateringDays,
      repotInterval: repotMonths,
      lastWateredAt: lastWatered,
      lastRepotCheckAt: lastRepotCheck,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="plant-form-modal" role="dialog" aria-modal="true" aria-labelledby="plant-form-title">
        <div className="modal-header"><div><div className="eyebrow">{plant ? "MAKE IT YOURS" : "A NEW LITTLE FRIEND"}</div><h2 id="plant-form-title">{plant ? "Edit care schedule" : "Add a plant"}</h2></div><button className="icon-button" aria-label="Close form" onClick={onClose}><X size={19} /></button></div>
        <form onSubmit={submit}>
          <label className="form-label">Plant name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Monstera" /></label>
          <div className="photo-input-wrap">
            <div className="photo-preview">{photo ? <img src={photo} alt="Plant preview" /> : <span><Sprout size={22} /></span>}</div>
            <div><strong>Give it a face</strong><p>Add a photo if you like. JPG, PNG or WebP · up to 2 MB.</p><label className="button button-secondary photo-button">{photo ? "Change photo" : "Choose a photo"}<input type="file" accept="image/*" onChange={handlePhoto} /></label></div>
          </div>
          <label className="form-label">Watering check-in <span className="input-with-suffix"><input type="number" min="1" max="365" value={watering} onChange={(event) => setWatering(event.target.value)} required /><span>days</span></span><small>A reminder to check the soil—not a rule to water.</small></label>
          <label className="form-label">Repotting check-in <span className="input-with-suffix"><input type="number" min="1" max="60" value={repot} onChange={(event) => setRepot(event.target.value)} required /><span>months</span></span><small>Look for crowded roots and other signs before repotting.</small></label>
          <div className="form-date-grid">
            <label className="form-label">Last watered<input type="date" value={lastWatered} max={toDateInput(new Date())} onChange={(event) => setLastWatered(event.target.value)} required /></label>
            <label className="form-label">Last repot check<input type="date" value={lastRepotCheck} max={toDateInput(new Date())} onChange={(event) => setLastRepotCheck(event.target.value)} required /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary"><Check size={16} />{plant ? "Save changes" : "Add to My Plants"}</button></div>
        </form>
      </section>
    </div>
  );
}

export default App;
