import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  dbGetUser, dbCreateUser, dbGetProjects, dbSaveProjects,
  auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "./firebase";

// Для личного использования на GitHub Pages.
// Важно: это фронтенд-логин. Он скрывает интерфейс, но не является полноценной серверной защитой.
// Перед публикацией поменяй логин и пароль ниже.
const AUTH = {
  login: "admin",
  password: "admin123",
};

const initialProjects = [
  {
    id: 1,
    name: "Pushka VPN",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
    tasks: [
      { id: 101, title: "Исправить подпись TestFlight build", status: "in_progress", deadline: "2026-04-28", priority: "high", note: "", attachments: [] },
      { id: 102, title: "Обновить инструкцию установки через TestFlight", status: "waiting", deadline: "2026-04-30", priority: "medium", note: "", attachments: [] },
      { id: 103, title: "Подготовить пост для Telegram", status: "done", deadline: "2026-04-24", priority: "low", note: "", attachments: [] },
    ],
  },
  {
    id: 2,
    name: "МясАльянс",
    color: "bg-rose-100 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    tasks: [
      { id: 201, title: "Доработать логотип", status: "in_progress", deadline: "2026-04-27", priority: "medium", note: "", attachments: [] },
      { id: 202, title: "Сделать универсальную этикетку для колбасы", status: "waiting", deadline: "2026-05-02", priority: "high", note: "", attachments: [] },
    ],
  },
  {
    id: 3,
    name: "ВКР / презентация",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    tasks: [
      { id: 301, title: "Слайд 13: экономическая эффективность", status: "in_progress", deadline: "2026-04-29", priority: "high", note: "", attachments: [] },
      { id: 302, title: "Добавить схемы и диаграммы", status: "waiting", deadline: "2026-05-05", priority: "medium", note: "", attachments: [] },
      { id: 303, title: "Слайд 10: обоснование решения", status: "done", deadline: "2026-04-23", priority: "medium", note: "", attachments: [] },
    ],
  },
];

const statusConfig = {
  in_progress: {
    title: "В работе",
    label: "ACTIVE",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    empty: "Нет активных задач",
  },
  waiting: {
    title: "Лист ожидания",
    label: "WAIT",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    empty: "Нет задач в ожидании",
  },
  done: {
    title: "Выполнено",
    label: "DONE",
    badge: "bg-green-100 text-green-800 border-green-200",
    empty: "Нет выполненных задач",
  },
};

const priorityLabels = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

const priorityClasses = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-orange-50 text-orange-700 border-orange-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: reader.result,
      });
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isOverdue(deadline, status) {
  if (!deadline || status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deadline);
  return due < today;
}

function formatDate(date) {
  if (!date) return "Без срока";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getMonthDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const calendarStart = startOfWeek(firstDay);

  return Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));
}

function getWeekDays(date) {
  const weekStart = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function formatMonthTitle(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}


export default function ProjectTodoDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [googleUser, setGoogleUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasInitialLoadedRef = useRef(false);
  const [authMode, setAuthMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ login: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ login: "", password: "", repeatPassword: "" });
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");

  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("all");
  const [search, setSearch] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newTask, setNewTask] = useState({
    projectId: 1,
    title: "",
    status: "in_progress",
    deadline: "",
    priority: "medium",
    note: "",
    attachments: [],
  });
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarView, setCalendarView] = useState("month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [editingTask, setEditingTask] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [showNewTaskProjectPicker, setShowNewTaskProjectPicker] = useState(false);
  

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setGoogleUser(firebaseUser);
        setCurrentUser(firebaseUser.uid);
        setIsLoggedIn(true);
        setIsLoading(false);
      } else {
        setGoogleUser(null);
        const savedAuth = localStorage.getItem("ptd_auth") === "true";
        const savedUser = localStorage.getItem("ptd_currentUser") || "";
        if (savedAuth && savedUser) {
          setCurrentUser(savedUser);
          setIsLoggedIn(true);
        }
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (googleUser) return;
    localStorage.setItem("ptd_auth", String(isLoggedIn));
  }, [isLoggedIn, googleUser]);

  useEffect(() => {
    if (googleUser) return;
    localStorage.setItem("ptd_currentUser", currentUser || "");
  }, [currentUser, googleUser]);

  useEffect(() => {
    if (!currentUser) return;
    hasInitialLoadedRef.current = false;
    setIsLoading(true);
    dbGetProjects(currentUser)
      .then((items) => {
        setProjects(items ?? (currentUser === AUTH.login ? initialProjects : []));
        setIsLoading(false);
        hasInitialLoadedRef.current = true;
      })
      .catch(() => {
        setProjects(currentUser === AUTH.login ? initialProjects : []);
        setIsLoading(false);
        hasInitialLoadedRef.current = true;
      });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !hasInitialLoadedRef.current) return;
    dbSaveProjects(currentUser, projects);
  }, [projects, currentUser]);

  const allTasks = useMemo(() => {
    return projects.flatMap((project) =>
      project.tasks.map((task) => ({
        ...task,
        projectId: project.id,
        projectName: project.name,
        projectColor: project.color,
        projectDot: project.dot,
      }))
    );
  }, [projects]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return allTasks.filter((task) => {
      const matchesProject = activeProjectId === "all" || task.projectId === activeProjectId;
      const matchesSearch =
        !query ||
        task.title.toLowerCase().includes(query) ||
        task.projectName.toLowerCase().includes(query) ||
        (task.note || "").toLowerCase().includes(query);

      return matchesProject && matchesSearch;
    });
  }, [allTasks, activeProjectId, search]);

  const stats = useMemo(() => {
    return {
      total: filteredTasks.length,
      in_progress: filteredTasks.filter((task) => task.status === "in_progress").length,
      waiting: filteredTasks.filter((task) => task.status === "waiting").length,
      done: filteredTasks.filter((task) => task.status === "done").length,
      overdue: filteredTasks.filter((task) => isOverdue(task.deadline, task.status)).length,
    };
  }, [filteredTasks]);

  const visibleProjects = useMemo(() => {
    if (activeProjectId === "all") return projects;
    return projects.filter((project) => project.id === activeProjectId);
  }, [projects, activeProjectId]);

  const handleLogin = async (event) => {
    event.preventDefault();
    const login = loginForm.login.trim();
    setIsLoading(true);
    try {
      let user = await dbGetUser(login);
      if (!user && login === AUTH.login && loginForm.password === AUTH.password) {
        await dbCreateUser(login, AUTH.password);
        await dbSaveProjects(login, initialProjects);
        user = { password: AUTH.password };
      }
      if (user && user.password === loginForm.password) {
        setLoginError("");
        setCurrentUser(login);
        setIsLoggedIn(true);
      } else {
        setLoginError("Неверный логин или пароль");
        setIsLoading(false);
      }
    } catch {
      setLoginError("Ошибка соединения. Попробуйте снова.");
      setIsLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();

    const login = registerForm.login.trim();
    const password = registerForm.password;
    const repeatPassword = registerForm.repeatPassword;

    if (login.length < 3) {
      setRegisterError("Логин минимум 3 символа");
      return;
    }

    if (password.length < 5) {
      setRegisterError("Пароль минимум 5 символов");
      return;
    }

    if (password !== repeatPassword) {
      setRegisterError("Пароли не совпадают");
      return;
    }

    setIsLoading(true);
    try {
      const existing = await dbGetUser(login);
      if (existing) {
        setRegisterError("Такой логин уже существует");
        setIsLoading(false);
        return;
      }
      await dbCreateUser(login, password);
      await dbSaveProjects(login, []);
      setRegisterForm({ login: "", password: "", repeatPassword: "" });
      setRegisterError("");
      setAuthMode("login");
      setLoginForm({ login, password: "" });
    } catch {
      setRegisterError("Ошибка соединения. Попробуйте снова.");
    }
    setIsLoading(false);
  };

  const logout = async () => {
    if (googleUser) {
      await signOut(auth);
    } else {
      localStorage.setItem("ptd_auth", "false");
      localStorage.setItem("ptd_currentUser", "");
    }
    hasInitialLoadedRef.current = false;
    setProjects([]);
    setIsLoggedIn(false);
    setCurrentUser("");
    setGoogleUser(null);
    setLoginForm({ login: "", password: "" });
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") {
        setLoginError("Ошибка входа через Google. Попробуйте снова.");
      }
      setIsLoading(false);
    }
  };

  const moveTask = (taskId, nextStatus) => {
    setProjects((prev) =>
      prev.map((project) => ({
        ...project,
        tasks: project.tasks.map((task) =>
          task.id === taskId ? { ...task, status: nextStatus } : task
        ),
      }))
    );
  };

  const handleDragStart = (taskId) => {
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (event, status) => {
    event.preventDefault();
    setDragOverStatus(status);
  };

  const handleDrop = (event, status) => {
    event.preventDefault();

    if (draggedTaskId) {
      moveTask(draggedTaskId, status);
    }

    setDraggedTaskId(null);
    setDragOverStatus(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverStatus(null);
  };

  const deleteTask = (taskId) => {
    setProjects((prev) =>
      prev.map((project) => ({
        ...project,
        tasks: project.tasks.filter((task) => task.id !== taskId),
      }))
    );
  };

  const handleNewTaskFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const maxFileSize = 2 * 1024 * 1024;
    const validFiles = files.filter((file) => file.size <= maxFileSize);
    const attachments = await Promise.all(validFiles.map(readFileAsAttachment));

    setNewTask((prev) => ({
      ...prev,
      attachments: [...(prev.attachments || []), ...attachments],
    }));

    event.target.value = "";
  };

  const removeNewTaskAttachment = (attachmentId) => {
    setNewTask((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((file) => file.id !== attachmentId),
    }));
  };

  const removeTaskAttachment = (taskId, attachmentId) => {
    setProjects((prev) =>
      prev.map((project) => ({
        ...project,
        tasks: project.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                attachments: (task.attachments || []).filter((file) => file.id !== attachmentId),
              }
            : task
        ),
      }))
    );
  };

  const openEditTask = (task) => {
    setEditingTask({
      id: task.id,
      projectId: task.projectId,
      title: task.title || "",
      note: task.note || "",
      status: task.status || "in_progress",
      deadline: task.deadline || "",
      priority: task.priority || "medium",
      attachments: task.attachments || [],
    });
  };

  const closeEditTask = () => {
    setEditingTask(null);
  };

  const handleEditTaskFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const maxFileSize = 2 * 1024 * 1024;
    const validFiles = files.filter((file) => file.size <= maxFileSize);
    const attachments = await Promise.all(validFiles.map(readFileAsAttachment));

    setEditingTask((prev) => ({
      ...prev,
      attachments: [...(prev.attachments || []), ...attachments],
    }));

    event.target.value = "";
  };

  const removeEditingAttachment = (attachmentId) => {
    setEditingTask((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((file) => file.id !== attachmentId),
    }));
  };

  const saveEditedTask = () => {
    if (!editingTask || !editingTask.title.trim()) return;

    setProjects((prev) =>
      prev.map((project) => ({
        ...project,
        tasks: project.tasks.map((task) =>
          task.id === editingTask.id
            ? {
                ...task,
                title: editingTask.title.trim(),
                note: editingTask.note.trim(),
                status: editingTask.status,
                deadline: editingTask.deadline,
                priority: editingTask.priority,
                attachments: editingTask.attachments || [],
              }
            : task
        ),
      }))
    );

    setEditingTask(null);
  };

  const addTask = () => {
    if (!newTask.title.trim()) return;

    setProjects((prev) =>
      prev.map((project) =>
        project.id === Number(newTask.projectId)
          ? {
              ...project,
              tasks: [
                ...project.tasks,
                {
                  id: Date.now(),
                  title: newTask.title.trim(),
                  status: newTask.status,
                  deadline: newTask.deadline,
                  priority: newTask.priority,
                  note: newTask.note.trim(),
                  attachments: newTask.attachments || [],
                },
              ],
            }
          : project
      )
    );

    setNewTask({
      projectId: projects[0]?.id || 1,
      title: "",
      status: "in_progress",
      deadline: "",
      priority: "medium",
      note: "",
      attachments: [],
    });
  };

  const addProject = () => {
    const name = newProjectName.trim();
    if (!name) return;

    const dots = ["bg-blue-500", "bg-rose-500", "bg-emerald-500", "bg-violet-500", "bg-cyan-500", "bg-orange-500"];
    const colors = [
      "bg-blue-100 text-blue-700 border-blue-200",
      "bg-rose-100 text-rose-700 border-rose-200",
      "bg-emerald-100 text-emerald-700 border-emerald-200",
      "bg-violet-100 text-violet-700 border-violet-200",
      "bg-cyan-100 text-cyan-700 border-cyan-200",
      "bg-orange-100 text-orange-700 border-orange-200",
    ];
    const index = projects.length % dots.length;
    const id = Date.now();

    setProjects((prev) => [
      ...prev,
      {
        id,
        name,
        color: colors[index],
        dot: dots[index],
        tasks: [],
      },
    ]);
    setNewProjectName("");
    setActiveProjectId(id);
    setNewTask((prev) => ({ ...prev, projectId: id }));
  };

  const openEditProject = (project) => {
    setEditingProject({
      id: project.id,
      name: project.name || "",
      dot: project.dot || "bg-blue-500",
      color: project.color || "bg-blue-100 text-blue-700 border-blue-200",
    });
  };

  const closeEditProject = () => {
    setEditingProject(null);
  };

  const saveEditedProject = () => {
    if (!editingProject || !editingProject.name.trim()) return;

    setProjects((prev) =>
      prev.map((project) =>
        project.id === editingProject.id
          ? {
              ...project,
              name: editingProject.name.trim(),
              dot: editingProject.dot,
              color: editingProject.color,
            }
          : project
      )
    );

    setEditingProject(null);
  };

  const requestDeleteProject = (project) => {
    setProjectToDelete(project);
  };

  const cancelDeleteProject = () => {
    setProjectToDelete(null);
  };

  const confirmDeleteProject = () => {
    if (!projectToDelete) return;

    const projectId = projectToDelete.id;

    setProjects((prev) => {
      const nextProjects = prev.filter((project) => project.id !== projectId);

      if (activeProjectId === projectId) {
        setActiveProjectId(nextProjects.length ? nextProjects[0].id : "all");
      }

      setNewTask((current) => ({
        ...current,
        projectId: nextProjects[0]?.id || "",
      }));

      return nextProjects;
    });

    if (editingProject?.id === projectId) {
      setEditingProject(null);
    }

    setProjectToDelete(null);
  };

  const resetData = () => {
    setProjects(initialProjects);
    setActiveProjectId("all");
  };

  if (isLoading && !isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-slate-400 text-sm">Загрузка...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-900">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
          <div className="mb-6">
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Задачки Алеши
            </div>
            <h1 className="text-2xl font-bold">Вход в список задач</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Введите логин и пароль, чтобы открыть панель проектов.
            </p>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setLoginError("");
                setRegisterError("");
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                authMode === "login"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Вход
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setLoginError("");
                setRegisterError("");
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                authMode === "register"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Регистрация
            </button>
          </div>

          {authMode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-3">
            <input
              placeholder="Логин"
              value={loginForm.login}
              onChange={(event) => setLoginForm({ ...loginForm, login: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
            />
            <input
              type="password"
              placeholder="Пароль"
              value={loginForm.password}
              onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
            />

            {loginError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {loginError}
              </div>
            )}

            <button disabled={isLoading} className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
                {isLoading ? "Загрузка..." : "Войти"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <input
                placeholder="Придумайте логин"
                value={registerForm.login}
                onChange={(event) => setRegisterForm({ ...registerForm, login: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
              />

              <input
                type="password"
                placeholder="Придумайте пароль"
                value={registerForm.password}
                onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
              />

              <input
                type="password"
                placeholder="Повторите пароль"
                value={registerForm.repeatPassword}
                onChange={(event) => setRegisterForm({ ...registerForm, repeatPassword: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
              />

              {registerError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {registerError}
                </div>
              )}

              <button disabled={isLoading} className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
                {isLoading ? "Загрузка..." : "Зарегистрироваться"}
              </button>
            </form>
          )}

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">или</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Войти через Google
          </button>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
            Вот это нихуя себе даже вход через гугл есть, еще и firebase оу ес
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isDarkTheme ? "dark-theme" : ""} min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 text-slate-900 md:p-6`}>
      <style>{`
        .dark-theme {
          background:
            radial-gradient(circle at 8% -8%, rgba(220, 38, 38, 0.22), transparent 24%),
            radial-gradient(circle at 100% 0%, rgba(127, 29, 29, 0.2), transparent 28%),
            linear-gradient(135deg, #030303 0%, #080808 55%, #120405 100%) !important;
          color: #f8fafc !important;
        }

        .dark-theme * {
          scrollbar-color: #dc2626 #090909;
        }

        .dark-theme header,
        .dark-theme aside > div,
        .dark-theme main > div:first-child,
        .dark-theme main > section,
        .dark-theme .calendar-panel,
        .dark-theme .modal-panel {
          background: #090909 !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7) !important;
        }

        .dark-theme [class*="bg-white"],
        .dark-theme [class*="bg-slate-50"],
        .dark-theme [class*="bg-slate-100"],
        .dark-theme [class*="from-slate-50"],
        .dark-theme [class*="to-white"] {
          background: #0d0d0d !important;
          background-image: none !important;
        }

        .dark-theme .project-head {
          background: linear-gradient(135deg, #111111 0%, #210708 100%) !important;
          border-color: rgba(220, 38, 38, 0.38) !important;
        }

        .dark-theme .status-column {
          background: #101010 !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
        }

        .dark-theme .task-card,
        .dark-theme .calendar-task,
        .dark-theme .calendar-day,
        .dark-theme .day-calendar,
        .dark-theme .stat-card,
        .dark-theme .file-zone,
        .dark-theme .file-row,
        .dark-theme .task-note,
        .dark-theme .empty-state {
          background: #070707 !important;
          border-color: rgba(255, 255, 255, 0.13) !important;
          color: #f8fafc !important;
          box-shadow: none !important;
        }

        .dark-theme .task-card:hover,
        .dark-theme .calendar-task:hover,
        .dark-theme .status-column:hover,
        .dark-theme button:hover {
          border-color: rgba(220, 38, 38, 0.55) !important;
        }

        .dark-theme input,
        .dark-theme textarea,
        .dark-theme select {
          background: #050505 !important;
          border-color: rgba(255, 255, 255, 0.18) !important;
          color: #ffffff !important;
          box-shadow: none !important;
        }

        .dark-theme input:focus,
        .dark-theme textarea:focus,
        .dark-theme select:focus {
          border-color: #dc2626 !important;
          box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.22) !important;
        }

        .dark-theme input::placeholder,
        .dark-theme textarea::placeholder {
          color: rgba(255, 255, 255, 0.45) !important;
        }

        .dark-theme option {
          background: #050505 !important;
          color: #ffffff !important;
        }

        .dark-theme .custom-select-trigger,
        .dark-theme .custom-select-menu {
          background: #050505 !important;
          border-color: rgba(255, 255, 255, 0.18) !important;
          color: #ffffff !important;
          box-shadow: 0 22px 60px rgba(0, 0, 0, 0.72) !important;
        }

        .dark-theme .custom-select-trigger:hover {
          background: #111111 !important;
          border-color: rgba(220, 38, 38, 0.52) !important;
        }

        .dark-theme .custom-select-menu button:not([class*="bg-slate-900"]) {
          background: transparent !important;
          color: #f8fafc !important;
        }

        .dark-theme .custom-select-menu button:not([class*="bg-slate-900"]):hover {
          background: #151515 !important;
          border-color: rgba(220, 38, 38, 0.45) !important;
        }

        .dark-theme .text-slate-950,
        .dark-theme .text-slate-900,
        .dark-theme .text-slate-800,
        .dark-theme .text-slate-700,
        .dark-theme .text-slate-600,
        .dark-theme .text-slate-500 {
          color: #f8fafc !important;
        }

        .dark-theme .text-slate-400,
        .dark-theme .text-slate-300 {
          color: rgba(255, 255, 255, 0.62) !important;
        }

        .dark-theme .border-slate-100,
        .dark-theme .border-slate-200,
        .dark-theme .border-slate-200\/80,
        .dark-theme .border-white\/70 {
          border-color: rgba(255, 255, 255, 0.13) !important;
        }

        .dark-theme .active-project,
        .dark-theme button.bg-slate-900,
        .dark-theme .bg-slate-900,
        .dark-theme .rounded-full.bg-slate-900,
        .dark-theme button[class*="bg-slate-900"] {
          background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%) !important;
          border-color: rgba(248, 113, 113, 0.58) !important;
          color: #ffffff !important;
        }

        .dark-theme .active-project span,
        .dark-theme button.bg-slate-900 span {
          color: #ffffff !important;
        }

        .dark-theme button:not(.theme-toggle):not(.active-project):not([class*="bg-slate-900"]) {
          background: #0d0d0d !important;
          border-color: rgba(255, 255, 255, 0.14) !important;
          color: #f8fafc !important;
        }

        .dark-theme button:not(.theme-toggle):not(.active-project):not([class*="bg-slate-900"]):hover {
          background: #181818 !important;
          color: #ffffff !important;
        }

        .dark-theme .theme-toggle {
          background: #ffffff !important;
          border-color: #ffffff !important;
          color: #050505 !important;
          box-shadow: 0 12px 34px rgba(220, 38, 38, 0.25) !important;
        }

        .dark-theme .theme-toggle:hover {
          background: #dc2626 !important;
          border-color: #dc2626 !important;
          color: #ffffff !important;
        }

        .dark-theme .bg-blue-100,
        .dark-theme .bg-cyan-100,
        .dark-theme .bg-violet-100,
        .dark-theme .bg-rose-100,
        .dark-theme .bg-emerald-100,
        .dark-theme .bg-green-100,
        .dark-theme .bg-amber-100,
        .dark-theme .bg-orange-50,
        .dark-theme .bg-orange-100,
        .dark-theme .bg-red-50,
        .dark-theme .bg-red-100 {
          background: rgba(220, 38, 38, 0.16) !important;
          border-color: rgba(248, 113, 113, 0.45) !important;
          color: #ffffff !important;
        }

        .dark-theme .text-red-600,
        .dark-theme .text-red-700,
        .dark-theme .text-red-500,
        .dark-theme .hover\:text-red-600:hover,
        .dark-theme .hover\:text-red-700:hover {
          color: #f87171 !important;
        }

        .dark-theme .border-red-200 {
          border-color: rgba(248, 113, 113, 0.55) !important;
        }

        .dark-theme .ring-slate-900,
        .dark-theme .ring-slate-300 {
          --tw-ring-color: #dc2626 !important;
        }

        .dark-theme .ring-offset-2 {
          --tw-ring-offset-color: #050505 !important;
        }

        .dark-theme .line-through {
          color: rgba(255, 255, 255, 0.42) !important;
        }

        .dark-theme a {
          color: #ffffff !important;
        }

        .dark-theme .opacity-50 {
          opacity: 0.42 !important;
        }
      `}</style>
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-sm shadow-slate-200/70 backdrop-blur md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                Task board
              </div>
              <h1 className="text-2xl font-bold tracking-tight md:text-4xl">
                Контроль задач от Алеши
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Проекты, дедлайны, статусы и вложения в одной рабочей панели.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={() => setIsDarkTheme((prev) => !prev)}
                  className="theme-toggle rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {isDarkTheme ? "Светлая тема" : "Темная тема"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Всего" value={stats.total} />
                <Stat label="В работе" value={stats.in_progress} />
                <Stat label="Ожидают" value={stats.waiting} />
                <Stat label="Готово" value={stats.done} />
                <Stat label="Просрочено" value={stats.overdue} danger />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={resetData}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Сбросить данные
                </button>
                <button
                  onClick={logout}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                >
                  Выйти
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[310px_1fr]">
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-sm shadow-slate-200/60 backdrop-blur">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-700">Проекты</div>
                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{projects.length}</div>
              </div>
              <div className="space-y-2">
                <ProjectButton
                  active={activeProjectId === "all"}
                  label="Все проекты"
                  count={allTasks.length}
                  onClick={() => setActiveProjectId("all")}
                />
                {projects.map((project) => (
                  <ProjectButton
                    key={project.id}
                    active={activeProjectId === project.id}
                    label={project.name}
                    count={project.tasks.length}
                    dot={project.dot}
                    onClick={() => {
                      setActiveProjectId(project.id);
                      setNewTask((prev) => ({ ...prev, projectId: project.id }));
                    }}
                    onEdit={() => openEditProject(project)}
                    onDelete={() => requestDeleteProject(project)}
                  />
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  placeholder="Новый проект"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addProject();
                  }}
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                />
                <button
                  onClick={addProject}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  +
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-sm shadow-slate-200/60 backdrop-blur">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-700">Новая задача</div>
                <div className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">+</div>
              </div>

              <div className="space-y-3">
                <textarea
                  placeholder="Напиши задачу"
                  value={newTask.title}
                  onChange={(event) => setNewTask({ ...newTask, title: event.target.value })}
                  className="min-h-[88px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                />

                <textarea
                  placeholder="Комментарий к задаче, детали, ссылка — необязательно"
                  value={newTask.note}
                  onChange={(event) => setNewTask({ ...newTask, note: event.target.value })}
                  className="min-h-[72px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                />

                <ProjectPicker
                  projects={projects}
                  selectedProjectId={newTask.projectId}
                  open={showNewTaskProjectPicker}
                  setOpen={setShowNewTaskProjectPicker}
                  onSelect={(projectId) => {
                    setNewTask({ ...newTask, projectId });
                    setShowNewTaskProjectPicker(false);
                  }}
                />

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                    value={newTask.status}
                    onChange={(event) => setNewTask({ ...newTask, status: event.target.value })}
                  >
                    <option value="in_progress">В работе</option>
                    <option value="waiting">Лист ожидания</option>
                    <option value="done">Выполнено</option>
                  </select>

                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                    value={newTask.priority}
                    onChange={(event) => setNewTask({ ...newTask, priority: event.target.value })}
                  >
                    <option value="high">Высокий</option>
                    <option value="medium">Средний</option>
                    <option value="low">Низкий</option>
                  </select>
                </div>

                <input
                  type="date"
                  value={newTask.deadline}
                  onChange={(event) => setNewTask({ ...newTask, deadline: event.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                />

                <div className="file-zone rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
                  <label className="block cursor-pointer rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100">
                    Прикрепить файл
                    <input
                      type="file"
                      multiple
                      onChange={handleNewTaskFiles}
                      className="hidden"
                    />
                  </label>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Файлы сохраняются в браузере. Лучше использовать небольшие файлы до 2 МБ.
                  </p>
                  {(newTask.attachments || []).length > 0 && (
                    <div className="mt-3 space-y-2">
                      {newTask.attachments.map((file) => (
                        <div key={file.id} className="file-row flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
                          <span className="min-w-0 truncate text-slate-700">
                            {file.name} · {formatFileSize(file.size)}
                          </span>
                          <button
                            onClick={() => removeNewTaskAttachment(file.id)}
                            className="shrink-0 font-semibold text-red-500 hover:text-red-700"
                          >
                            убрать
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={addTask}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Добавить задачу
                </button>
              </div>
            </div>
          </aside>

          <main className="space-y-4">
            <div className="flex flex-col gap-3 rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-sm shadow-slate-200/60 backdrop-blur md:flex-row md:items-center md:justify-between">
              <input
                placeholder="Поиск по задачам, комментариям и проектам"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-slate-400 md:max-w-md"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="text-sm text-slate-500">
                  Показано задач: <span className="font-semibold text-slate-900">{filteredTasks.length}</span>
                </div>
                <button
                  onClick={() => setShowCalendar((prev) => !prev)}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                    showCalendar
                      ? "bg-slate-900 text-white hover:bg-slate-700"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {showCalendar ? "Скрыть календарь" : "Календарь дедлайнов"}
                </button>
              </div>
            </div>

            {showCalendar && (
              <CalendarPanel
                tasks={filteredTasks}
                view={calendarView}
                setView={setCalendarView}
                currentDate={calendarDate}
                setCurrentDate={setCalendarDate}
              />
            )}

            <div className="space-y-4">
              {visibleProjects.map((project) => {
                const projectTasks = filteredTasks.filter((task) => task.projectId === project.id);

                return (
                  <section key={project.id} className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-sm shadow-slate-200/60 backdrop-blur md:p-5">
                    <div className="project-head mb-4 flex flex-col gap-3 rounded-3xl border border-slate-100 bg-gradient-to-r from-slate-50 to-white p-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`h-3 w-3 shrink-0 rounded-full ${project.dot}`} />
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-bold">{project.name}</h2>
                          <p className="text-xs text-slate-500">
                            {projectTasks.length} задач в проекте · переносите карточки между блоками
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => openEditProject(project)}
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => requestDeleteProject(project)}
                          className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {Object.entries(statusConfig).map(([status, config]) => {
                        const tasks = projectTasks.filter((task) => task.status === status);

                        return (
                          <section
                            key={`${project.id}-${status}`}
                            onDragOver={(event) => handleDragOver(event, `${project.id}-${status}`)}
                            onDragLeave={() => setDragOverStatus(null)}
                            onDrop={(event) => handleDrop(event, status)}
                            className={`status-column flex min-h-[240px] flex-col rounded-[1.6rem] border border-slate-200/80 bg-slate-50/80 p-4 transition hover:bg-white hover:shadow-sm ${
                              dragOverStatus === `${project.id}-${status}` ? "ring-2 ring-slate-900 ring-offset-2" : ""
                            }`}
                          >
                            <div className="mb-4 flex min-h-[72px] flex-col items-center justify-center gap-1 text-center">
                              <h3 className="text-lg font-bold">{config.title}</h3>
                              <div className={`rounded-full border px-3 py-1 text-xs font-bold ${config.badge}`}>
                                {tasks.length} задач · {config.label}
                              </div>
                            </div>

                            <div className="flex-1 space-y-3">
                              {tasks.length === 0 ? (
                                <div className="empty-state rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
                                  {config.empty}
                                </div>
                              ) : (
                                tasks.map((task) => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    onMove={moveTask}
                                    onDelete={deleteTask}
                                    onRemoveAttachment={removeTaskAttachment}
                                    onEdit={openEditTask}
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    isDragging={draggedTaskId === task.id}
                                  />
                                ))
                              )}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {visibleProjects.length === 0 && (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
                  Проектов пока нет. Добавьте проект через левую панель.
                </div>
              )}
            </div>
          </main>
        </section>
      </div>

      {editingTask && (
        <EditTaskPanel
          task={editingTask}
          projects={projects}
          setTask={setEditingTask}
          onClose={closeEditTask}
          onSave={saveEditedTask}
          onFilesChange={handleEditTaskFiles}
          onRemoveAttachment={removeEditingAttachment}
        />
      )}

      {editingProject && (
        <EditProjectPanel
          project={editingProject}
          setProject={setEditingProject}
          onClose={closeEditProject}
          onSave={saveEditedProject}
          onDelete={() => requestDeleteProject(editingProject)}
        />
      )}

      {projectToDelete && (
        <DeleteProjectModal
          project={projectToDelete}
          onCancel={cancelDeleteProject}
          onConfirm={confirmDeleteProject}
        />
      )}
    </div>
  );
}

function DeleteProjectModal({ project, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
      <div className="modal-panel w-full max-w-md rounded-[2rem] border border-white/70 bg-white p-5 shadow-2xl shadow-slate-950/20 md:p-6">
        <div className="mb-4">
          <div className="mb-2 inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
            Удаление проекта
          </div>
          <h2 className="text-xl font-bold">Удалить «{project.name}»?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Проект будет удалён вместе со всеми задачами и вложениями внутри него. Это действие нельзя отменить.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onCancel}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="rounded-2xl border border-red-700 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Да, удалить
          </button>
        </div>
      </div>
    </div>
  );
}

function EditProjectPanel({ project, setProject, onClose, onSave, onDelete }) {
  const colorOptions = [
    { label: "Синий", dot: "bg-blue-500", color: "bg-blue-100 text-blue-700 border-blue-200" },
    { label: "Красный", dot: "bg-rose-500", color: "bg-rose-100 text-rose-700 border-rose-200" },
    { label: "Зеленый", dot: "bg-emerald-500", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { label: "Фиолетовый", dot: "bg-violet-500", color: "bg-violet-100 text-violet-700 border-violet-200" },
    { label: "Голубой", dot: "bg-cyan-500", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    { label: "Оранжевый", dot: "bg-orange-500", color: "bg-orange-100 text-orange-700 border-orange-200" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-md">
      <div className="modal-panel w-full max-w-xl rounded-[2rem] border border-white/70 bg-white p-5 shadow-2xl shadow-slate-950/20 md:p-6">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-bold">Редактирование проекта</h2>
            <p className="mt-1 text-sm text-slate-500">
              Можно изменить название проекта, цветовую метку или удалить проект полностью.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            Закрыть
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400">
              Название проекта
            </label>
            <input
              value={project.name}
              onChange={(event) => setProject({ ...project, name: event.target.value })}
              placeholder="Название проекта"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400">
              Цвет проекта
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {colorOptions.map((option) => {
                const active = project.dot === option.dot;
                return (
                  <button
                    key={option.dot}
                    onClick={() => setProject({ ...project, dot: option.dot, color: option.color })}
                    className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`h-3 w-3 rounded-full ${option.dot}`} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
            <button
              onClick={onDelete}
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              Удалить проект
            </button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                onClick={onClose}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                onClick={onSave}
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Сохранить проект
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditTaskPanel({ task, projects, setTask, onClose, onSave, onFilesChange, onRemoveAttachment }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-md">
      <div className="modal-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/70 bg-white p-5 shadow-2xl shadow-slate-950/20 md:p-6">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-bold">Редактирование задачи</h2>
            <p className="mt-1 text-sm text-slate-500">
              Можно изменить название, описание, статус, дедлайн и вложения.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            Закрыть
          </button>
        </div>

        <div className="space-y-3">
          <textarea
            placeholder="Название задачи"
            value={task.title}
            onChange={(event) => setTask({ ...task, title: event.target.value })}
            className="min-h-[90px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
          />

          <textarea
            placeholder="Описание / комментарий к задаче"
            value={task.note}
            onChange={(event) => setTask({ ...task, note: event.target.value })}
            className="min-h-[110px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
          />

          <select
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            value={task.projectId}
            onChange={(event) => setTask({ ...task, projectId: Number(event.target.value) })}
            disabled
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              value={task.status}
              onChange={(event) => setTask({ ...task, status: event.target.value })}
            >
              <option value="in_progress">В работе</option>
              <option value="waiting">Лист ожидания</option>
              <option value="done">Выполнено</option>
            </select>

            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              value={task.priority}
              onChange={(event) => setTask({ ...task, priority: event.target.value })}
            >
              <option value="high">Высокий</option>
              <option value="medium">Средний</option>
              <option value="low">Низкий</option>
            </select>

            <input
              type="date"
              value={task.deadline}
              onChange={(event) => setTask({ ...task, deadline: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
          </div>

          <div className="file-zone rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
            <label className="block cursor-pointer rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100">
              Добавить вложение
              <input type="file" multiple onChange={onFilesChange} className="hidden" />
            </label>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Файлы сохраняются в браузере. Лучше использовать небольшие файлы до 2 МБ.
            </p>

            {(task.attachments || []).length > 0 && (
              <div className="mt-3 space-y-2">
                {task.attachments.map((file) => (
                  <div key={file.id} className="file-row flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
                    <a
                      href={file.dataUrl}
                      download={file.name}
                      className="min-w-0 truncate font-semibold text-slate-700 hover:text-slate-950"
                    >
                      {file.name} · {formatFileSize(file.size)}
                    </a>
                    <button
                      onClick={() => onRemoveAttachment(file.id)}
                      className="shrink-0 font-semibold text-red-500 hover:text-red-700"
                    >
                      удалить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              onClick={onSave}
              className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Сохранить изменения
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPicker({ selectedStatus, open, setOpen, onSelect }) {
  const selected = statusConfig[selectedStatus] || statusConfig.in_progress;
  const statusDots = {
    in_progress: "bg-amber-500",
    waiting: "bg-slate-500",
    done: "bg-green-500",
  };
  const statusDescriptions = {
    in_progress: "Задача уже выполняется",
    waiting: "Задача отложена или ждёт запуска",
    done: "Задача завершена",
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="custom-select-trigger flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={`h-3 w-3 shrink-0 rounded-full ${statusDots[selectedStatus] || "bg-slate-400"}`} />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Статус задачи
            </span>
            <span className="block truncate font-semibold text-slate-800">
              {selected.title}
            </span>
          </span>
        </span>
        <span className={`shrink-0 rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 transition ${open ? "rotate-180" : ""}`}>
          ↓
        </span>
      </button>

      {open && (
        <div className="custom-select-menu absolute left-0 right-0 top-[calc(100%+8px)] z-40 rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-200/80">
          {Object.entries(statusConfig).map(([status, config]) => {
            const active = selectedStatus === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => onSelect(status)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                  active
                    ? "border border-slate-900 bg-slate-900 text-white"
                    : "border border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${active ? "bg-white" : statusDots[status]}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{config.title}</span>
                    <span className={`block text-xs ${active ? "text-white/70" : "text-slate-400"}`}>
                      {statusDescriptions[status]}
                    </span>
                  </span>
                </span>
                {active && <span className="shrink-0 rounded-full bg-white/15 px-2 py-1 text-xs font-bold">Выбран</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectPicker({ projects, selectedProjectId, open, setOpen, onSelect }) {
  const selectedProject = projects.find((project) => project.id === Number(selectedProjectId));

  if (!projects.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">
        Сначала добавьте проект
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="custom-select-trigger flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={`h-3 w-3 shrink-0 rounded-full ${selectedProject?.dot || "bg-slate-300"}`} />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Проект для задачи
            </span>
            <span className="block truncate font-semibold text-slate-800">
              {selectedProject?.name || "Выберите проект"}
            </span>
          </span>
        </span>
        <span className={`shrink-0 rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 transition ${open ? "rotate-180" : ""}`}>
          ↓
        </span>
      </button>

      {open && (
        <div className="custom-select-menu absolute left-0 right-0 top-[calc(100%+8px)] z-40 max-h-72 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-200/80">
          {projects.map((project) => {
            const active = Number(selectedProjectId) === project.id;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelect(project.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                  active
                    ? "border border-slate-900 bg-slate-900 text-white"
                    : "border border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${active ? "bg-white" : project.dot}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{project.name}</span>
                    <span className={`block text-xs ${active ? "text-white/70" : "text-slate-400"}`}>
                      {project.tasks.length} задач
                    </span>
                  </span>
                </span>
                {active && <span className="shrink-0 rounded-full bg-white/15 px-2 py-1 text-xs font-bold">Выбран</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CalendarPanel({ tasks, view, setView, currentDate, setCurrentDate }) {
  const tasksByDate = useMemo(() => {
    return tasks.reduce((acc, task) => {
      if (!task.deadline) return acc;
      if (!acc[task.deadline]) acc[task.deadline] = [];
      acc[task.deadline].push(task);
      return acc;
    }, {});
  }, [tasks]);

  const goToday = () => setCurrentDate(new Date());

  const goPrev = () => {
    if (view === "month") setCurrentDate((date) => addMonths(date, -1));
    if (view === "week") setCurrentDate((date) => addDays(date, -7));
    if (view === "day") setCurrentDate((date) => addDays(date, -1));
  };

  const goNext = () => {
    if (view === "month") setCurrentDate((date) => addMonths(date, 1));
    if (view === "week") setCurrentDate((date) => addDays(date, 7));
    if (view === "day") setCurrentDate((date) => addDays(date, 1));
  };

  const title =
    view === "month"
      ? formatMonthTitle(currentDate)
      : view === "week"
      ? `${formatDate(getWeekDays(currentDate)[0])} — ${formatDate(getWeekDays(currentDate)[6])}`
      : formatFullDate(currentDate);

  return (
    <section className="calendar-panel rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-sm shadow-slate-200/60 backdrop-blur md:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            Deadline calendar
          </div>
          <h2 className="mt-1 text-xl font-bold capitalize">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Здесь отображаются дедлайны задач по текущему проекту и поисковому фильтру.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <CalendarTab active={view === "month"} onClick={() => setView("month")}>Месяц</CalendarTab>
          <CalendarTab active={view === "week"} onClick={() => setView("week")}>Неделя</CalendarTab>
          <CalendarTab active={view === "day"} onClick={() => setView("day")}>День</CalendarTab>
          <button onClick={goPrev} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Назад
          </button>
          <button onClick={goToday} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Сегодня
          </button>
          <button onClick={goNext} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Вперёд
          </button>
        </div>
      </div>

      {view === "month" && <MonthCalendar currentDate={currentDate} tasksByDate={tasksByDate} />}
      {view === "week" && <WeekCalendar currentDate={currentDate} tasksByDate={tasksByDate} />}
      {view === "day" && <DayCalendar currentDate={currentDate} tasksByDate={tasksByDate} />}
    </section>
  );
}

function CalendarTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function MonthCalendar({ currentDate, tasksByDate }) {
  const days = getMonthDays(currentDate);
  const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const todayKey = toDateKey(new Date());

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-2">
        {weekDays.map((day) => (
          <div key={day} className="px-2 text-center text-xs font-bold uppercase tracking-wide text-slate-400">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {days.map((day) => {
          const key = toDateKey(day);
          const dayTasks = tasksByDate[key] || [];
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isToday = key === todayKey;

          return (
            <CalendarDayCell
              key={key}
              date={day}
              tasks={dayTasks}
              muted={!isCurrentMonth}
              isToday={isToday}
              compact
            />
          );
        })}
      </div>
    </div>
  );
}

function WeekCalendar({ currentDate, tasksByDate }) {
  const days = getWeekDays(currentDate);
  const todayKey = toDateKey(new Date());

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
      {days.map((day) => {
        const key = toDateKey(day);
        return (
          <CalendarDayCell
            key={key}
            date={day}
            tasks={tasksByDate[key] || []}
            isToday={key === todayKey}
          />
        );
      })}
    </div>
  );
}

function DayCalendar({ currentDate, tasksByDate }) {
  const key = toDateKey(currentDate);
  const tasks = tasksByDate[key] || [];

  return (
    <div className="day-calendar rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold capitalize">{formatFullDate(currentDate)}</h3>
          <p className="text-sm text-slate-500">Дедлайнов на этот день: {tasks.length}</p>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          На этот день дедлайнов нет
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => <CalendarTask key={task.id} task={task} />)}
        </div>
      )}
    </div>
  );
}

function CalendarDayCell({ date, tasks, muted = false, isToday = false, compact = false }) {
  return (
    <div className={`calendar-day min-h-[150px] min-w-0 overflow-hidden rounded-2xl border p-2 ${
      isToday ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
    } ${muted ? "opacity-50" : ""}`}>
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-sm font-bold ${isToday ? "text-slate-900" : "text-slate-600"}`}>
            {date.getDate()}
          </div>
          <div className="truncate text-xs capitalize text-slate-400">
            {new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date)}
          </div>
        </div>
        {tasks.length > 0 && (
          <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
            {tasks.length}
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="truncate text-xs text-slate-300">Нет дедлайнов</div>
      ) : (
        <div className="min-w-0 space-y-1.5 overflow-hidden">
          {tasks.slice(0, compact ? 3 : 10).map((task) => <CalendarTask key={task.id} task={task} compact={compact} />)}
          {compact && tasks.length > 3 && (
            <div className="truncate rounded-xl bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
              ещё {tasks.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarTask({ task, compact = false }) {
  const overdue = isOverdue(task.deadline, task.status);
  const statusText = statusConfig[task.status]?.title || "Задача";

  return (
    <div className={`calendar-task min-w-0 overflow-hidden rounded-xl border bg-white text-xs ${
      compact ? "px-2 py-1.5" : "px-3 py-3"
    } ${overdue ? "border-red-200" : "border-slate-200"}`}>
      <div className="mb-1 flex min-w-0 items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${task.projectDot || "bg-slate-400"}`} />
        <span className="min-w-0 truncate font-medium text-slate-500">
          {task.projectName}
        </span>
      </div>

      <div className={`min-w-0 break-words font-semibold leading-4 ${
        compact ? "line-clamp-2" : "line-clamp-3"
      } ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>
        {task.title}
      </div>

      {!compact && task.note && (
        <div className="mt-1 min-w-0 break-words text-slate-500 line-clamp-2">{task.note}</div>
      )}

      <div className="mt-2 flex min-w-0 flex-wrap gap-1">
        <span className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
          {statusText}
        </span>
        <span className={`max-w-full truncate rounded-full border px-2 py-0.5 ${priorityClasses[task.priority]}`}>
          {priorityLabels[task.priority]}
        </span>
        {overdue && (
          <span className="max-w-full truncate rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">
            Просрочено
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, danger = false }) {
  return (
    <div className="stat-card rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center shadow-sm shadow-slate-100">
      <div className={`text-2xl font-bold ${danger && value > 0 ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function ProjectButton({ active, label, count, onClick, dot, onEdit, onDelete }) {
  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  const baseClass = active
    ? "active-project border-slate-900 bg-slate-900 text-white"
    : "border-slate-200 bg-white hover:bg-slate-50";

  const countClass = active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600";
  const editClass = active
    ? "border-white/30 bg-white/15 text-white hover:bg-white/25"
    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-900 hover:text-white";
  const deleteClass = active
    ? "border-white/30 bg-white/15 text-white hover:bg-red-600"
    : "border-red-100 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white";

  return (
    <div className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className={`flex w-full cursor-pointer items-center justify-between rounded-2xl border px-3 py-3 pr-20 text-left text-sm transition hover:-translate-y-0.5 ${baseClass}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-white" : dot || "bg-slate-300"}`} />
          <span className="min-w-0 truncate">{label}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${countClass}`}>{count}</span>
      </div>

      {onEdit && onDelete ? (
        <div className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onEdit();
            }}
            className={`rounded-full border px-2 py-1 text-[10px] font-bold transition ${editClass}`}
            title="Редактировать проект"
          >
            Ред.
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete();
            }}
            className={`rounded-full border px-2 py-1 text-[10px] font-bold transition ${deleteClass}`}
            title="Удалить проект"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TaskCard({ task, onMove, onDelete, onRemoveAttachment, onEdit, onDragStart, onDragEnd, isDragging }) {
  const overdue = isOverdue(task.deadline, task.status);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragEnd={onDragEnd}
      className={`task-card cursor-grab rounded-[1.35rem] border bg-white p-4 shadow-sm shadow-slate-200/70 transition hover:-translate-y-1 hover:shadow-lg active:cursor-grabbing ${
        overdue ? "border-red-200" : "border-slate-200"
      } ${isDragging ? "opacity-50 ring-2 ring-slate-300" : ""}`}
    >
      <div className="mb-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${task.projectColor}`}>
            {task.projectName}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onEdit(task);
              }}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-900 hover:text-white"
              title="Редактировать задачу"
            >
              Ред.
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDelete(task.id);
              }}
              className="rounded-full px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              Удалить
            </button>
          </div>
        </div>
        <h3 className={`whitespace-pre-line font-semibold leading-snug ${
          task.status === "done" ? "text-slate-400 line-through" : "text-slate-900"
        }`}>
          {task.title}
        </h3>
        {task.note && (
          <p className="task-note mt-2 whitespace-pre-line rounded-2xl bg-slate-50 p-3 text-sm leading-5 text-slate-500">
            {task.note}
          </p>
        )}

        {(task.attachments || []).length > 0 && (
          <div className="file-zone mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Вложения
            </div>
            <div className="space-y-2">
              {(task.attachments || []).map((file) => (
                <div key={file.id} className="file-row flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
                  <a
                    href={file.dataUrl}
                    download={file.name}
                    className="min-w-0 truncate font-semibold text-slate-700 hover:text-slate-950"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {file.name} · {formatFileSize(file.size)}
                  </a>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveAttachment(task.id, file.id);
                    }}
                    className="shrink-0 font-semibold text-red-500 hover:text-red-700"
                  >
                    удалить
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
          Дедлайн: {formatDate(task.deadline)}
        </span>
        <span className={`rounded-full border px-2.5 py-1 ${priorityClasses[task.priority]}`}>
          {priorityLabels[task.priority]}
        </span>
        {overdue && (
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">
            Просрочено
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatusButton active={task.status === "in_progress"} onClick={() => onMove(task.id, "in_progress")}>
          В работе
        </StatusButton>
        <StatusButton active={task.status === "waiting"} onClick={() => onMove(task.id, "waiting")}>
          Ожидает
        </StatusButton>
        <StatusButton active={task.status === "done"} onClick={() => onMove(task.id, "done")}>
          Готово
        </StatusButton>
      </div>
    </div>
  );
}

function StatusButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
