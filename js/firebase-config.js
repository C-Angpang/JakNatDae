// Firebase SDK (CDN)
const firebaseScript = document.createElement('script');
firebaseScript.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
document.head.appendChild(firebaseScript);

const firestoreScript = document.createElement('script');
firestoreScript.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js';
document.head.appendChild(firestoreScript);

// Firebase 설정 - 여기에 본인의 Firebase 프로젝트 config를 붙여넣으세요
const firebaseConfig = {
    apiKey: "AIzaSyBLhIOV23JUqbAhdXs_Qin83Hce9V8O97E",
    authDomain: "jaknahdae.firebaseapp.com",
    databaseURL: "https://jaknahdae-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "jaknahdae",
    storageBucket: "jaknahdae.firebasestorage.app",
    messagingSenderId: "654120513834",
    appId: "1:654120513834:web:e22c793c2917c312512e53"
};

// localStorage 기반 fallback DB (Firebase 미설정 시 사용)
function createLocalDB() {
    const STORAGE_KEY = 'tournament_data';

    function getData() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch { return {}; }
    }

    function setData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function getNestedValue(obj, path) {
        return path.split('/').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : null, obj);
    }

    function setNestedValue(obj, path, value) {
        const keys = path.split('/');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        if (value === null) {
            delete current[keys[keys.length - 1]];
        } else {
            current[keys[keys.length - 1]] = value;
        }
        return obj;
    }

    function ref(path) {
        return {
            once: () => Promise.resolve({
                val: () => getNestedValue(getData(), path)
            }),
            set: (value) => {
                const data = getData();
                setNestedValue(data, path, value);
                setData(data);
                return Promise.resolve();
            },
            remove: () => {
                const data = getData();
                setNestedValue(data, path, null);
                setData(data);
                return Promise.resolve();
            },
            push: () => {
                const newKey = 'match_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                const childPath = path + '/' + newKey;
                return {
                    set: (value) => {
                        const data = getData();
                        setNestedValue(data, childPath, value);
                        setData(data);
                        return Promise.resolve();
                    }
                };
            }
        };
    }

    return { ref };
}

let db = null;
const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

function waitForFirebase() {
    return new Promise((resolve) => {
        if (!isFirebaseConfigured) {
            console.log('Firebase 미설정 - localStorage 모드로 동작합니다.');
            db = createLocalDB();
            resolve(db);
            return;
        }

        let attempts = 0;
        const check = () => {
            attempts++;
            if (typeof firebase !== 'undefined' && firebase.database) {
                firebase.initializeApp(firebaseConfig);
                db = firebase.database();
                resolve(db);
            } else if (attempts > 50) {
                console.warn('Firebase SDK 로드 실패 - localStorage 모드로 전환합니다.');
                db = createLocalDB();
                resolve(db);
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

const dbReady = waitForFirebase();
