

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp, FirebaseApp } from "firebase/app";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged,
    Auth,
    User
} from "firebase/auth";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc,
    Firestore
} from "firebase/firestore";
import type { Chart } from 'chart.js';

interface Resource {
    title: string;
    url: string;
}

interface TaskStatus {
    [key: string]: boolean;
}

interface Progress {
    completed: number;
    total: number;
}

interface PhaseProgress {
    [phase: string]: Progress;
}

const firebaseConfig = {
    apiKey: "AIzaSyBLtDhyGA1POPfId9jymvSXUI48J6PU4VI",
    authDomain: "salesforce-roadmap-learning.firebaseapp.com",
    projectId: "salesforce-roadmap-learning",
    storageBucket: "salesforce-roadmap-learning.appspot.com",
    messagingSenderId: "174526879884",
    appId: "1:174526879884:web:bfcecd0dec69b7744183a9",
    measurementId: "G-GD4MRDH12G"
};


const phaseData = {
    'phase-1': { index: 0, label: 'Admin', days: 35 },
    'phase-2': { index: 1, label: 'App Builder', days: 20 },
    'phase-3': { index: 2, label: 'Developer', days: 45 }
};

const colors = {
    active: '#2563eb',
    inactive: '#d1d5db',
    dark: {
        inactive: '#4b5563'
    }
};

const getInitialTheme = (): 'light' | 'dark' => {
    // The source of truth is now the class on the <html> element,
    // which is set by the script in index.html BEFORE React loads.
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
};


const App: React.FC = () => {
    const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [taskStatus, setTaskStatus] = useState<TaskStatus>({});
    const [userResources, setUserResources] = useState<Resource[]>([
        { title: 'Free Salesforce Administrator Tutorials', url: 'https://s2-labs.com/free-salesforce-administrator-tutorials/' }
    ]);
    const [progress, setProgress] = useState<PhaseProgress>({});
    
    const [activeMainSection, setActiveMainSection] = useState('roadmap-container');
    const [activePhase, setActivePhase] = useState('phase-1');
    const [activeWeeks, setActiveWeeks] = useState<{ [key: string]: string }>({
        'phase-1': 'week-1',
        'phase-2': 'week-6',
        'phase-3': 'week-9'
    });
    
    const [newResourceTitle, setNewResourceTitle] = useState('');
    const [newResourceUrl, setNewResourceUrl] = useState('');

    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<Chart | null>(null);
    const firebaseApp = useRef<FirebaseApp | null>(null);
    const auth = useRef<Auth | null>(null);
    const db = useRef<Firestore | null>(null);


    const updateChartHighlight = useCallback((phaseId: string, currentTheme: string) => {
        if (!chartInstanceRef.current) return;
        
        const activeIndex = phaseData[phaseId as keyof typeof phaseData]?.index;
        if (activeIndex === undefined) return;
        
        const backgroundColors = [
            currentTheme === 'light' ? colors.inactive : colors.dark.inactive,
            currentTheme === 'light' ? colors.inactive : colors.dark.inactive,
            currentTheme === 'light' ? colors.inactive : colors.dark.inactive,
        ];
        backgroundColors[activeIndex] = colors.active;
        
        chartInstanceRef.current.data.datasets[0].backgroundColor = backgroundColors;
        chartInstanceRef.current.update();
    }, []);
    
    // Effect to apply theme to DOM
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
        }
        updateChartHighlight(activePhase, theme);
    }, [theme, activePhase, updateChartHighlight]);

    // Main effect for initialization and data loading - runs only ONCE
    useEffect(() => {
        let unsubscribe: () => void = () => {};
        try {
            const app = initializeApp(firebaseConfig);
            firebaseApp.current = app;
            const authInstance = getAuth(app);
            auth.current = authInstance;
            db.current = getFirestore(app);

            unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                setCurrentUser(user);
                
                if (user && db.current) {
                    // USER IS LOGGED IN
                    const docRef = doc(db.current, "userProgress", user.uid);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        // Existing user: load from Firestore
                        const data = docSnap.data();
                        setTaskStatus(data.tasks || {});
                        setUserResources(data.resources || [{ title: 'Free Salesforce Administrator Tutorials', url: 'https://s2-labs.com/free-salesforce-administrator-tutorials/' }]);
                        if (data.theme) {
                            setTheme(data.theme);
                            // Sync local storage so it's correct if they log out
                            localStorage.setItem('salesforceTheme', data.theme);
                        }
                    } else {
                        // New user: migrate local data to Firestore
                        const localTasks = JSON.parse(localStorage.getItem('salesforceTaskStatus') || '{}');
                        const localResources = JSON.parse(localStorage.getItem('salesforceResources') || 'null') || [{ title: 'Free Salesforce Administrator Tutorials', url: 'https://s2-labs.com/free-salesforce-administrator-tutorials/' }];
                        const localTheme = (localStorage.getItem('salesforceTheme') as 'light' | 'dark') || 'light';
                        
                        setTaskStatus(localTasks);
                        setUserResources(localResources);
                        setTheme(localTheme);
                        
                        // Save the migrated data to their new Firestore doc
                        await setDoc(docRef, { tasks: localTasks, resources: localResources, theme: localTheme });
                        
                        localStorage.removeItem('salesforceTaskStatus');
                        localStorage.removeItem('salesforceResources');
                    }
                } else {
                    // USER IS A GUEST (OR LOGGED OUT)
                    const localTasks = JSON.parse(localStorage.getItem('salesforceTaskStatus') || '{}');
                    const localResources = JSON.parse(localStorage.getItem('salesforceResources') || 'null') || [{ title: 'Free Salesforce Administrator Tutorials', url: 'https://s2-labs.com/free-salesforce-administrator-tutorials/' }];
                    const localTheme = (localStorage.getItem('salesforceTheme') as 'light' | 'dark') || 'light';

                    setTaskStatus(localTasks);
                    setUserResources(localResources);
                    setTheme(localTheme);
                }
            });

        } catch (e) {
            console.error("Firebase initialization failed:", e);
            // Fallback for non-firebase environments
            const localTasks = JSON.parse(localStorage.getItem('salesforceTaskStatus') || '{}');
            const localResources = JSON.parse(localStorage.getItem('salesforceResources') || 'null') || [{ title: 'Free Salesforce Administrator Tutorials', url: 'https://s2-labs.com/free-salesforce-administrator-tutorials/' }];
            const localTheme = (localStorage.getItem('salesforceTheme') as 'light' | 'dark') || 'light';
            setTaskStatus(localTasks);
            setUserResources(localResources);
            setTheme(localTheme);
        }

        return () => unsubscribe(); // Cleanup listener on unmount
    }, []); // Empty dependency array ensures this runs only once


    useEffect(() => {
        if (!chartRef.current) return;
        const ctx = chartRef.current.getContext('2d');
        if (!ctx) return;

        const Chart = (window as any).Chart;

        chartInstanceRef.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Roadmap'],
                datasets: [
                    { label: 'Admin', data: [phaseData['phase-1'].days], backgroundColor: colors.active, stack: 'a' },
                    { label: 'App Builder', data: [phaseData['phase-2'].days], backgroundColor: colors.inactive, stack: 'a' },
                    { label: 'Developer', data: [phaseData['phase-3'].days], backgroundColor: colors.inactive, stack: 'a' }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: false },
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context: any) => `${context.dataset.label}: ${context.raw} days`
                        }
                    }
                },
                scales: {
                    x: { stacked: true, display: false },
                    y: { stacked: true, display: false }
                }
            }
        });
        updateChartHighlight(activePhase, theme);

        return () => {
            chartInstanceRef.current?.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        updateChartHighlight(activePhase, theme);
    }, [activePhase, theme, updateChartHighlight]);


    const calculateProgress = useCallback(() => {
        const allPhaseCheckboxes: NodeListOf<HTMLInputElement> = document.querySelectorAll('.task-checkbox');
        const newProgress: PhaseProgress = {};

        Object.keys(phaseData).forEach(phaseId => {
            const phaseTasks = Array.from(allPhaseCheckboxes).filter(cb => cb.dataset.phase === phaseId);
            const total = phaseTasks.length;
            const completed = phaseTasks.filter(cb => taskStatus[cb.dataset.taskId as string]).length;
            newProgress[phaseId] = { completed, total };
        });
        setProgress(newProgress);
    }, [taskStatus]);

    useEffect(() => {
        calculateProgress();
    }, [taskStatus, calculateProgress]);
    
    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { taskId } = e.target.dataset;
        const isChecked = e.target.checked;
        if (taskId) {
            const newStatus = { ...taskStatus, [taskId]: isChecked };
            setTaskStatus(newStatus);

            if (currentUser && db.current) {
                setDoc(doc(db.current, "userProgress", currentUser.uid), { tasks: newStatus }, { merge: true });
            } else {
                localStorage.setItem('salesforceTaskStatus', JSON.stringify(newStatus));
            }
        }
    };
    
    const handleAddResource = (e: React.FormEvent) => {
        e.preventDefault();
        if (newResourceTitle && newResourceUrl) {
            const newResources = [...userResources, { title: newResourceTitle, url: newResourceUrl }];
            setUserResources(newResources);

            if (currentUser && db.current) {
                setDoc(doc(db.current, "userProgress", currentUser.uid), { resources: newResources }, { merge: true });
            } else {
                localStorage.setItem('salesforceResources', JSON.stringify(newResources));
            }

            setNewResourceTitle('');
            setNewResourceUrl('');
        }
    };

    const handleDeleteResource = (indexToDelete: number) => {
        const newResources = userResources.filter((_, index) => index !== indexToDelete);
        setUserResources(newResources);

        if (currentUser && db.current) {
            setDoc(doc(db.current, "userProgress", currentUser.uid), { resources: newResources }, { merge: true });
        } else {
            localStorage.setItem('salesforceResources', JSON.stringify(newResources));
        }
    };

    const handleLogin = () => {
        if (!auth.current) return;
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth.current, provider).catch(error => {
            console.error("Login failed:", error);
        });
    };

    const handleLogout = () => {
        if (auth.current) signOut(auth.current);
    };

    const handleToggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);

        if (currentUser && db.current) {
            setDoc(doc(db.current, "userProgress", currentUser.uid), { theme: newTheme }, { merge: true });
        } else {
            localStorage.setItem('salesforceTheme', newTheme);
        }
    };

    const handleShowMainSection = (sectionId: string) => {
        setActiveMainSection(sectionId);
        if (sectionId === 'roadmap-container') {
            setActivePhase('phase-1');
        }
    };

    const handleShowPhase = (phaseId: string) => {
        setActivePhase(phaseId);
        const firstWeek = document.querySelector(`#${phaseId}-week-nav .week-tab`)?.getAttribute('data-week');
        if (firstWeek) {
            setActiveWeeks(prev => ({...prev, [phaseId]: firstWeek}));
        }
    };
    
    const handleShowWeek = (phaseId: string, weekId: string) => {
        setActiveWeeks(prev => ({ ...prev, [phaseId]: weekId }));
    };

    const getTaskCardClass = (taskId: string) => {
        let baseClass = "task-card bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-sm border border-gray-200";
        if (taskStatus[taskId]) {
            baseClass += " completed";
        }
        return baseClass;
    };
    
    // Create a dynamic style for the progress bars
    const getProgressStyle = (phaseId: string) => {
        const p = progress[phaseId];
        const percentage = p && p.total > 0 ? (p.completed / p.total) * 100 : 0;
        return { width: `${percentage}%` };
    };

    const renderTaskCard = (taskId: string, title: string, learning: string, practice: string, resources: Resource[], extraClasses: string = "") => (
        <div className={`${getTaskCardClass(taskId)} ${extraClasses}`}>
            <label className="flex items-center justify-between cursor-pointer">
                <h4 className={`task-title font-bold ${taskId.endsWith("EXAM DAY") ? 'text-xl' : 'text-lg'}`}>{title}</h4>
                <input 
                    type="checkbox" 
                    className="task-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" 
                    data-task-id={taskId} 
                    data-phase={taskId.substring(0,2) === 'p1' ? 'phase-1' : taskId.substring(0,2) === 'p2' ? 'phase-2' : 'phase-3'}
                    checked={!!taskStatus[taskId]}
                    onChange={handleCheckboxChange}
                />
            </label>
            <div className="task-details mt-2">
                <ul className="list-disc list-inside space-y-1">
                    {learning && <li><span className="font-semibold">Learning:</span> {learning}</li>}
                    {practice && <li><span className="font-semibold">Practice:</span> {practice}</li>}
                    {!learning && !practice && taskId.includes("EXAM DAY") && <p className="mt-2">{resources[0].title}</p>}
                </ul>
                {resources.length > 0 && !taskId.includes("EXAM DAY") && (
                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-400 mb-2">Key Resources:</h5>
                        <ul className="list-none space-y-1.5">
                            {resources.map((res, i) => (
                                <li key={i}><a href={res.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm flex items-center"><span className="mr-2">➔</span>{res.title}</a></li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
             <style jsx>{`
                .task-card.completed .task-title {
                    text-decoration: line-through;
                    color: #6b7280;
                }
                .dark .task-card.completed .task-title {
                    color: #9ca3af;
                }
                .task-card.completed .task-details {
                    opacity: 0.7;
                }
            `}</style>
        </div>
    );
    
    return (
        <div className="text-gray-800 bg-white dark:bg-gray-900 dark:text-gray-200 transition-colors duration-200">
            <div className="container mx-auto p-4 md:p-8 max-w-7xl">
                <header className="text-center mb-8">
                    <div className="flex justify-end p-2 absolute top-0 right-0 items-center space-x-4">
                        <button id="theme-toggle-btn" onClick={handleToggleTheme} className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 flex items-center justify-center text-xl shadow hover:bg-gray-300 dark:hover:bg-gray-600 transition">
                             <span id="theme-icon-light" className={theme === 'light' ? '' : 'hidden'}>☀️</span>
                            <span id="theme-icon-dark" className={theme === 'dark' ? '' : 'hidden'}>🌙</span>
                        </button>
                        <div id="auth-container" className="text-sm">
                            {!currentUser ? (
                                <button id="login-btn" onClick={handleLogin} className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg shadow hover:bg-blue-700 transition">
                                    Login with Google to Save
                                </button>
                            ) : (
                                <div id="user-info" className="flex items-center">
                                    <span id="user-email" className="text-gray-600 dark:text-gray-400 mr-4">{currentUser.email}</span>
                                    <button id="logout-btn" onClick={handleLogout} className="bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 text-gray-800 font-medium py-2 px-4 rounded-lg hover:bg-gray-300 transition">
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white pt-12">Salesforce 100-Day Roadmap</h1>
                    <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">Your interactive journey from Admin to Developer in 400 hours.</p>
                </header>
                
                <main>
                    <nav className="flex border-b border-gray-300 dark:border-gray-700 mb-8" id="main-nav">
                        <button onClick={() => handleShowMainSection('roadmap-container')} className={`main-nav-tab py-4 px-6 text-lg font-medium text-gray-600 dark:text-gray-400 border-b-4 border-transparent hover:text-blue-600 dark:hover:text-blue-500 ${activeMainSection === 'roadmap-container' ? 'active' : ''}`}>
                            Roadmap
                        </button>
                        <button onClick={() => handleShowMainSection('resources-container')} className={`main-nav-tab py-4 px-6 text-lg font-medium text-gray-600 dark:text-gray-400 border-b-4 border-transparent hover:text-blue-600 dark:hover:text-blue-500 ${activeMainSection === 'resources-container' ? 'active' : ''}`}>
                            Resources
                        </button>
                        <button onClick={() => handleShowMainSection('beyond-100-container')} className={`main-nav-tab py-4 px-6 text-lg font-medium text-gray-600 dark:text-gray-400 border-b-4 border-transparent hover:text-blue-600 dark:hover:text-blue-500 ${activeMainSection === 'beyond-100-container' ? 'active' : ''}`}>
                            Beyond 100 Days
                        </button>
                         <style jsx>{`
                            .main-nav-tab.active {
                                border-bottom-color: #2563eb;
                                color: #2563eb;
                                font-weight: 600;
                            }
                        `}</style>
                    </nav>

                    {/* Main Content Containers */}
                    <div id="roadmap-container" className={`main-content ${activeMainSection !== 'roadmap-container' ? 'hidden' : ''}`}>
                        <section className="mb-8">
                            <h2 className="text-xl font-semibold text-center mb-4 dark:text-white">Your 100-Day Journey</h2>
                            <div className="chart-container relative w-full max-w-[900px] mx-auto h-[100px] max-h-[100px]">
                                <canvas ref={chartRef}></canvas>
                            </div>
                        </section>

                        <nav className="flex border-b border-gray-300 dark:border-gray-700 mb-8" id="phase-nav">
                            <button onClick={() => handleShowPhase('phase-1')} className={`phase-tab py-4 px-6 text-lg font-medium text-gray-600 dark:text-gray-400 border-b-4 border-transparent hover:text-blue-600 dark:hover:text-blue-500 ${activePhase === 'phase-1' ? 'active' : ''}`}>
                                Phase 1: Admin
                            </button>
                            <button onClick={() => handleShowPhase('phase-2')} className={`phase-tab py-4 px-6 text-lg font-medium text-gray-600 dark:text-gray-400 border-b-4 border-transparent hover:text-blue-600 dark:hover:text-blue-500 ${activePhase === 'phase-2' ? 'active' : ''}`}>
                                Phase 2: App Builder
                            </button>
                            <button onClick={() => handleShowPhase('phase-3')} className={`phase-tab py-4 px-6 text-lg font-medium text-gray-600 dark:text-gray-400 border-b-4 border-transparent hover:text-blue-600 dark:hover:text-blue-500 ${activePhase === 'phase-3' ? 'active' : ''}`}>
                                Phase 3: Developer
                            </button>
                            <style jsx>{`
                                .phase-tab.active {
                                    border-bottom-color: #2563eb;
                                    color: #2563eb;
                                    font-weight: 600;
                                }
                            `}</style>
                        </nav>
                        
                        <div id="phase-content-container">

                          {/* PHASE 1: ADMIN */}
                          <div id="phase-1-content" className={`phase-content ${activePhase !== 'phase-1' ? 'hidden' : ''}`}>
                              <div className="mb-6">
                                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Phase 1: The #AwesomeAdmin</h2>
                                  <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">Build the critical foundation. This phase covers 35 days (140 hours) and culminates in the Administrator (ADM 201) exam.</p>
                              </div>

                              <div className="mb-8">
                                  <div className="flex justify-between items-center mb-2">
                                      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Phase 1 Progress</h3>
                                      <span id="phase-1-progress-counter" className="text-sm font-medium text-gray-600 dark:text-gray-400">{progress['phase-1']?.completed || 0} / {progress['phase-1']?.total || 0} tasks completed</span>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                      <div id="phase-1-progress-bar" className="bg-blue-600 h-2.5 rounded-full" style={getProgressStyle('phase-1')}></div>
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                  <div className="bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-md border border-gray-200">
                                      <h3 className="text-lg font-semibold text-gray-500 dark:text-gray-400">Goal</h3>
                                      <p className="text-4xl font-bold text-blue-600 dark:text-blue-500">ADM 201</p>
                                      <p className="text-gray-600 dark:text-gray-400">Pass the Admin Exam</p>
                                  </div>
                                  <div className="bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-md border border-gray-200 md:col-span-2">
                                      <h3 className="text-lg font-semibold text-gray-500 dark:text-gray-400 mb-3">Key Resources</h3>
                                      <ul className="space-y-2">
                                          <li><a href="https://trailhead.salesforce.com/help?article=Salesforce-Certified-Administrator-Exam-Guide" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Official Exam Guide</a></li>
                                          <li><a href="https://trailhead.salesforce.com/users/strailhead/trailmixes/prepare-for-your-salesforce-administrator-credential" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Official Trailmix</a></li>
                                          <li><a href="https://trailhead.salesforce.com/content/learn/superbadges/security-specialist" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Security Superbadge</a></li>
                                          <li><span className="font-medium">Other:</span> Focus on Force, Salesforce Ben</li>
                                      </ul>
                                  </div>
                              </div>
                              
                              <nav className="flex flex-wrap gap-2 mb-6" id="phase-1-week-nav">
                                {['1', '2', '3', '4', '5'].map(weekNum => (
                                    <button key={`p1-w${weekNum}`} onClick={() => handleShowWeek('phase-1', `week-${weekNum}`)} className={`week-tab py-2 px-4 rounded-full font-medium text-gray-700 bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-blue-600 hover:bg-blue-500 hover:text-white ${activeWeeks['phase-1'] === `week-${weekNum}` ? 'active' : ''}`}>Week {weekNum}</button>
                                ))}
                              </nav>

                              <div id="phase-1-week-content" className="space-y-6">
                                <div id="phase-1-week-1-content" className={`week-content ${activeWeeks['phase-1'] !== 'week-1' ? 'hidden' : ''}`}>
                                    <h3 className="text-2xl font-semibold mb-4 dark:text-white">Week 1: Salesforce Fundamentals & Data Model</h3>
                                    {renderTaskCard('p1-d1-2', 'Day 1-2: The 30,000-ft View', 'What is a CRM? What is Salesforce? Sign up for your Dev Org & Trailhead.', 'Complete the [Admin Beginner] trail. Navigate Setup.', [{title: 'Official Trail: Admin Beginner', url: 'https://trailhead.salesforce.com/content/learn/trails/force_com_admin_beginner'}, {title: 'Module: Salesforce Platform Basics', url: 'https://trailhead.salesforce.com/content/learn/modules/salesforce-platform-basics'}], 'mt-4')}
                                    {renderTaskCard('p1-d3-4', 'Day 3-4: Org Setup & UI', 'Learn about Company Information, Fiscal Year, Business Hours, and Currencies.', 'Configure all of the above in your Dev Org. Create a new Lightning App. Customize the navigation bar.', [{title: 'Module: Lightning Experience Customization', url: 'https://trailhead.salesforce.com/content/learn/modules/lex_customization'}, {title: 'Article: Company Information Overview', url: 'https://help.salesforce.com/s/articleView?id=sf.admin_setup_company_profile.htm&type=5'}], 'mt-4')}
                                    {renderTaskCard('p1-d5-7', 'Day 5-7: Data Modeling (The Core)', 'Standard Objects (Account, Contact, Opportunity, Lead, Case). Custom Objects. Field Types. Schema Builder.', 'Create two custom objects: `Project__c` and `Task__c`. Create custom fields (Date, Picklist, Currency, etc.) on both. Use Schema Builder to visualize.', [{title: 'Module: Data Modeling', url: 'https://trailhead.salesforce.com/content/learn/modules/data_modeling'}, {title: 'Project: Build a Data Model', url: 'https://trailhead.salesforce.com/content/learn/projects/build-a-data-model-for-a-recruiting-app'}], 'mt-4')}
                                </div>
                                <div id="phase-1-week-2-content" className={`week-content ${activeWeeks['phase-1'] !== 'week-2' ? 'hidden' : ''}`}>
                                    <h3 className="text-2xl font-semibold mb-4 dark:text-white">Week 2: Relationships & Security (The Big One)</h3>
                                    {renderTaskCard('p1-d8-9', 'Day 8-9: Object Relationships', 'Master-Detail vs. Lookup relationships. Understand implications (roll-up summaries, security, deletions).', 'Create a Master-Detail from `Task__c` to `Project__c`. Create a Lookup from `Project__c` to `Account`.', [{title: 'Module: Object Relationships', url: 'https://trailhead.salesforce.com/content/learn/modules/data_modeling/object_relationships'}, {title: 'Article: Master-Detail vs. Lookup (Salesforce Ben)', url: 'https://www.salesforceben.com/master-detail-vs-lookup-relationship-salesforce/'}], 'mt-4')}
                                    {renderTaskCard('p1-d10-11', 'Day 10-11: User Setup & Profiles', 'Users, Roles, Profiles, and Permission Sets. Understand what a Profile controls.', 'Create two new Users. Create one new Profile and clone another. Create one Permission Set.', [{title: 'Module: User Management', url: 'https://trailhead.salesforce.com/content/learn/modules/user_management'}, {title: 'Module: Data Security', url: 'https://trailhead.salesforce.com/content/learn/modules/data_security'}], 'mt-4')}
                                    {renderTaskCard('p1-d12', 'Day 12: OWD & Field-Level Security', 'Organization-Wide Defaults (OWD).', 'Set `Project__c` to "Private." Use a Profile to make a field read-only. Use a Permission Set to grant edit access back. Log in as test users to confirm.', [{title: 'Module: Control Access to Records (OWD)', url: 'https://trailhead.salesforce.com/content/learn/modules/data_security/data_security_owd'}, {title: 'Module: Control Access to Fields (FLS)', url: 'https://trailhead.salesforce.com/content/learn/modules/data_security/data_security_fls'}], 'mt-4')}
                                    {renderTaskCard('p1-d13-14', 'Day 13-14: Roles & Sharing Rules', 'Role Hierarchy. Sharing Rules (Criteria-based & Ownership-based).', 'Build a 3-level Role Hierarchy. Log in as a manager. Create a Sharing Rule.', [{title: 'Module: Role Hierarchy', url: 'https://trailhead.salesforce.com/content/learn/modules/data_security/data_security_roles'}, {title: 'Module: Sharing Rules', url: 'https://trailhead.salesforce.com/content/learn/modules/data_security/data_security_sharing'}], 'mt-4')}
                                </div>
                                <div id="phase-1-week-3-content" className={`week-content ${activeWeeks['phase-1'] !== 'week-3' ? 'hidden' : ''}`}>
                                  <h3 className="text-2xl font-semibold mb-4 dark:text-white">Week 3: Automation with Flow (The Modern Way)</h3>
                                  {renderTaskCard('p1-d15-17', 'Day 15-17: Flow Fundamentals', 'CRITICAL: Focus 100% on Flow. Complete [Build Flows with Flow Builder] trail.', 'Build and debug simple flows. Understand variables, elements (Get, Create, Update), and loops.', [{title: 'Official Trail: Build Flows with Flow Builder', url: 'https://trailhead.salesforce.com/content/learn/trails/build-flows-with-flow-builder'}, {title: 'Article: Flow Builder Guide (Salesforce Ben)', url: 'https://www.salesforceben.com/salesforce-flow-builder-guide/'}], 'mt-4')}
                                  {renderTaskCard('p1-d18-19', 'Day 18-19: Record-Triggered Flows', 'Before-Save (fast field updates) vs. After-Save (actions).', "Build two flows: 1. Before-Save: Opp Stage 'Negotiation' -> Set Probability 75%. 2. After-Save: Opp Stage 'Closed Won' -> Create follow-up Task.", [{title: 'Module: Record-Triggered Flows', url: 'https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows'}, {title: 'Doc: Before-Save vs. After-Save', url: 'https://help.salesforce.com/s/articleView?id=sf.flow_concepts_trigger_record.htm&type=5'}], 'mt-4')}
                                  {renderTaskCard('p1-d20-21', 'Day 20-21: Screen Flows', 'How to build guided screens for users.', 'Build a 2-screen flow to create a Contact and add them to a Campaign. Put it on the Home Page.', [{title: 'Module: Screen Flows', url: 'https://trailhead.salesforce.com/content/learn/modules/screen-flows'}, {title: 'Project: Build a Simple Flow', url: 'https://trailhead.salesforce.com/content/learn/projects/build-a-simple-flow'}], 'mt-4')}
                                </div>
                                <div id="phase-1-week-4-content" className={`week-content ${activeWeeks['phase-1'] !== 'week-4' ? 'hidden' : ''}`}>
                                  <h3 className="text-2xl font-semibold mb-4 dark:text-white">Week 4: Data, UI & Analytics</h3>
                                  {renderTaskCard('p1-d22-23', 'Day 22-23: UI & Record Types', 'Page Layouts, Record Types, Compact Layouts.', "Create two Record Types for Opportunities ('New Business' vs. 'Renewal') with different Page Layouts.", [{title: 'Module: Record Types', url: 'https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_record_types'}, {title: 'Module: Page Layouts', url: 'https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_page_layouts'}], 'mt-4')}
                                  {renderTaskCard('p1-d24-25', 'Day 24-25: Data Management', 'Data Import Wizard vs. Data Loader.', 'Install Data Loader. Export all Accounts. Change `Industry` in CSV. Use `Update` to load changes.', [{title: 'Module: Data Management', url: 'https://trailhead.salesforce.com/content/learn/modules/data_management'}, {title: 'Doc: When to use Data Loader', url: 'https://help.salesforce.com/s/articleView?id=sf.data_loader.htm&type=5'}], 'mt-4')}
                                  {renderTaskCard('p1-d26-28', 'Day 26-28: Reports & Dashboards', 'Report Types. Report Formats (Tabular, Summary, Matrix, Joined). Dashboards & Components.', "Build one report of each format. Create a 'Sales Leaderboard' dashboard. Schedule a report.", [{title: 'Trail: Reports & Dashboards', url: 'https://trailhead.salesforce.com/content/learn/trails/analytics_admin_basics'}, {title: 'Project: Create Reports and Dashboards', url: 'https://trailhead.salesforce.com/content/learn/projects/create-reports-and-dashboards-for-sales-and-marketing-managers'}], 'mt-4')}
                                </div>
                                <div id="phase-1-week-5-content" className={`week-content ${activeWeeks['phase-1'] !== 'week-5' ? 'hidden' : ''}`}>
                                  <h3 className="text-2xl font-semibold mb-4 dark:text-white">Week 5: Service, Sales & Admin Exam Prep</h3>
                                  {renderTaskCard('p1-d29-30', 'Day 29-30: Service & Sales Clouds', 'Lead Process (Create, Convert). Case Process (Queues, Assignment Rules, Escalation Rules).', 'Convert a Lead. Set up a Case Queue and an Assignment Rule.', [{title: 'Module: Sales Cloud Basics', url: 'https://trailhead.salesforce.com/content/learn/modules/sales_admin_basics'}, {title: 'Module: Service Cloud Basics', url: 'https://trailhead.salesforce.com/content/learn/modules/service_admin_basics'}], 'mt-4')}
                                  {renderTaskCard('p1-d31-33', 'Day 31-33: Mock Exams & Review', 'Complete the [Prepare for Your Salesforce Administrator Credential] trailmix.', 'Take a full mock exam. Analyze your results. Understand *why* for every wrong answer.', [{title: 'Official Trailmix: Admin Cert Prep', url: 'https://trailhead.salesforce.com/users/strailhead/trailmixes/prepare-for-your-salesforce-administrator-credential'}, {title: 'Module: Admin Cert Prep: Setup', url: 'https://trailhead.salesforce.com/content/learn/modules/administrator-certification-prep-setup-and-objects'}], 'mt-4')}
                                  {renderTaskCard('p1-d34', 'Day 34: Final Drill', '', 'Re-do Trailhead modules in your weakest areas (e.g., "Security" or "Automation").', [{title: 'Superbadge: Security Specialist', url: 'https://trailhead.salesforce.com/content/learn/superbadges/security-specialist'}, {title: 'Superbadge: Process Automation Specialist', url: 'https://trailhead.salesforce.com/content/learn/superbadges/process-automation-specialist'}], 'mt-4')}
                                  {/* FIX: Add empty url to satisfy Resource type for exam day card where url is not used. */}
                                  {renderTaskCard('p1-d35_EXAM DAY', 'Day 35: EXAM DAY (ADM 201)', '', '', [{title: 'Final light review in the morning. Good luck!', url: ''}], 'bg-blue-100 dark:bg-blue-900/30 border-l-4 border-blue-500 text-blue-700 dark:text-blue-300 p-6 rounded-lg shadow-sm mt-4')}
                                </div>
                              </div>
                          </div>
                           {/* PHASE 2: APP BUILDER */}
                           <div id="phase-2-content" className={`phase-content ${activePhase !== 'phase-2' ? 'hidden' : ''}`}>
                               {/* Content for Phase 2 */}
                           </div>
                           {/* PHASE 3: DEVELOPER */}
                           <div id="phase-3-content" className={`phase-content ${activePhase !== 'phase-3' ? 'hidden' : ''}`}>
                               {/* Content for Phase 3 */}
                           </div>
                           <style jsx>{`
                                .week-tab.active {
                                    background-color: #2563eb;
                                    color: #ffffff;
                                }
                            `}</style>
                        </div>

                    </div>
                    
                    <div id="resources-container" className={`main-content ${activeMainSection !== 'resources-container' ? 'hidden' : ''}`}>
                        <section className="mb-12 bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-md border border-gray-200">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Master Resources</h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-4">Your personal list of links. Add new resources to review later.</p>
                            
                            <div id="master-resources-list" className="mb-4 space-y-3">
                                {userResources.length === 0 ? (
                                    <p className="text-gray-500 dark:text-gray-400 italic">No resources added yet.</p>
                                ) : (
                                    userResources.map((resource, index) => (
                                        <div key={index} className='flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-3 rounded-lg'>
                                            <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-medium break-all">
                                                {resource.title}
                                                <span className="text-sm text-gray-500 dark:text-gray-400 ml-2 hidden md:inline">{resource.url}</span>
                                            </a>
                                            <button onClick={() => handleDeleteResource(index)} className="delete-resource-btn text-red-500 hover:text-red-700 dark:hover:text-red-400 ml-4 p-1">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <form id="add-resource-form" onSubmit={handleAddResource} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <input type="text" value={newResourceTitle} onChange={(e) => setNewResourceTitle(e.target.value)} placeholder="Resource Title (e.g., 'S2 Labs')" required className="md:col-span-1 p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                <input type="url" value={newResourceUrl} onChange={(e) => setNewResourceUrl(e.target.value)} placeholder="https://..." required className="md:col-span-1 p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                                <button type="submit" className="md:col-span-1 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg shadow hover:bg-blue-700 transition">
                                    Add Resource
                                </button>
                            </form>
                        </section>
                    </div>

                    <div id="beyond-100-container" className={`main-content ${activeMainSection !== 'beyond-100-container' ? 'hidden' : ''}`}>
                         <section className="my-16">
                            <div className="text-center mb-10">
                                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Beyond Day 100: Your Advanced Developer Roadmap</h2>
                                <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">You've got the certs. Now become a master. Here are topics from your resources for the next phase of your journey.</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-md border border-gray-200">
                                    <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-500 mb-3">1. Advanced Integration</h3>
                                    <p className="text-gray-600 dark:text-gray-400 mb-4">Go beyond basic API calls. Learn to build event-driven, real-time integrations.</p>
                                    <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                                        <li>Platform Events</li>
                                        <li>Streaming API (PushTopic, Generic)</li>
                                        <li>Salesforce Connect (External Objects)</li>
                                        <li>Advanced REST & SOAP Callouts</li>
                                        <li>ETL (Extract, Transform, Load) Patterns</li>
                                    </ul>
                                </div>
                                
                                <div className="bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-md border border-gray-200">
                                    <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-500 mb-3">2. DevOps & CI/CD</h3>
                                    <p className="text-gray-600 dark:text-gray-400 mb-4">Move from "Change Sets" to a professional deployment and development lifecycle.</p>
                                    <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                                        <li>Salesforce DX (SFDX) & CLI</li>
                                        <li>Source Control (Git & GitHub)</li>
                                        <li>CI/CD (e.g., GitHub Actions, Jenkins, Copado)</li>
                                        <li>Scratch Orgs</li>
                                    </ul>
                                </div>

                                <div className="bg-white dark:bg-gray-800 dark:border-gray-700 p-6 rounded-lg shadow-md border border-gray-200">
                                    <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-500 mb-3">3. Specializations & PDI II</h3>
                                    <p className="text-gray-600 dark:text-gray-400 mb-4">Deepen your expertise in specific domains and prepare for the next level of certification.</p>
                                    <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                        <li>Platform Developer II (PDI I)</li>
                                        <li>Integration Architect</li>
                                        <li>Data Architect</li>
                                        <li>Einstein AI & Analytics</li>
                                        <li>Industry Clouds (Health, Financial, etc.)</li>
                                    </ul>
                                </div>
                            </div>
                        </section>
                    </div>

                </main>
            </div>
        </div>
    );
};

export default App;