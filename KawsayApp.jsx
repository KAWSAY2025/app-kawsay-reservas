import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

// Asegúrate de que Tailwind CSS esté disponible en el entorno.

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [clients, setClients] = useState([]); 
  const [holidays, setHolidays] = useState([]);
  const [addons, setAddons] = useState([]);
  const [prices, setPrices] = useState({});
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('reservas');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmMessage, setConfirmMessage] = useState('');

  // --- PASO 3: INSERTA TU ID ANTIGUO AQUÍ ---
  // Reemplaza 'default-app-id' con la "llave" que copiaste de tu versión anterior.
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'; 
  // -------------------------------------------

  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  useEffect(() => {
    if (firebaseConfig) {
      try {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authentication = getAuth(app);
        setDb(firestore);
        setAuth(authentication);
        onAuthStateChanged(authentication, async (user) => {
          if (user) {
            setUserId(user.uid);
          } else {
            try {
              if (initialAuthToken) await signInWithCustomToken(authentication, initialAuthToken);
              else await signInAnonymously(authentication);
            } catch (error) { console.error("Error de autenticación:", error); }
          }
          setIsAuthReady(true);
        });
      } catch (error) { console.error("Error inicializando Firebase:", error); }
    } else {
      setMessage('Configuración de Firebase no disponible.');
    }
  }, [firebaseConfig, initialAuthToken]);

  useEffect(() => {
    if (!db || !isAuthReady || appId === 'default-app-id') return;
    const publicDataPath = `artifacts/${appId}/public/data`;
    const collections = {
        rooms: setRooms,
        prices: (data) => {
            const pricesData = {};
            data.forEach(p => { pricesData[p.id] = p.price; });
            setPrices(pricesData);
        },
        reservations: (data) => setReservations(data.map(r => ({ ...r, fechaEntrada: r.fechaEntrada?.toDate(), fechaSalida: r.fechaSalida?.toDate() }))),
        holidays: (data) => setHolidays(data.map(h => ({ ...h, date: h.date?.toDate() }))),
        clients: setClients,
        adicionales: setAddons
    };
    const unsubscribes = Object.entries(collections).map(([coll, setter]) => 
        onSnapshot(collection(db, `${publicDataPath}/${coll}`), snapshot => setter(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), 
        (error) => console.error(`Error escuchando ${coll}:`, error))
    );
    return () => unsubscribes.forEach(unsub => unsub());
  }, [db, isAuthReady, appId]);

  useEffect(() => {
      if (!db || !isAuthReady || appId === 'default-app-id') return;
      const publicDataPath = `artifacts/${appId}/public/data`;

      if (isAuthReady && rooms.length === 0) {
          const roomsRef = collection(db, `${publicDataPath}/rooms`);
          const defaultRooms = [
              { id: 'KAWSAY', name: 'KAWSAY' }, { id: 'INFINITY', name: 'INFINITY' },
              { id: 'DIAMANTE', name: 'DIAMANTE' }, { id: 'JARDIN', name: 'JARDIN' }
          ];
          const promises = defaultRooms.map(room => setDoc(doc(roomsRef, room.id), { name: room.name }));
          Promise.all(promises).catch(err => console.error("Error initializing rooms:", err));
      }

      if (isAuthReady && rooms.length > 0 && Object.keys(prices).length === 0) {
          const pricesRef = collection(db, `${publicDataPath}/prices`);
          const defaultPrices = { 'KAWSAY': 500000, 'INFINITY': 500000, 'DIAMANTE': 350000, 'JARDIN': 450000 };
          const promises = Object.entries(defaultPrices).map(([roomName, price]) => setDoc(doc(pricesRef, roomName), { price }));
          Promise.all(promises).catch(err => console.error("Error initializing prices:", err));
      }
  }, [db, isAuthReady, rooms, prices, appId]);

  const showMessage = (msg, duration = 4000) => { setMessage(msg); setTimeout(() => setMessage(''), duration); };
  const requestConfirmation = (action, message) => { setConfirmAction(() => action); setConfirmMessage(message); setShowConfirmModal(true); };
  const handleConfirm = () => { if (confirmAction) confirmAction(); setShowConfirmModal(false); setConfirmAction(null); };
  const handleCancel = () => { setShowConfirmModal(false); setConfirmAction(null); };
  const normalizeDate = useCallback((date) => {
    if (!date) return null;
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, []);

  const DisponibilidadTab = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const getReservationForRoomAndDate = useCallback((roomName, date) => {
      const normalizedCheckDate = normalizeDate(date);
      return reservations.find(reservation => {
        const normalizedEntry = normalizeDate(reservation.fechaEntrada);
        const normalizedExit = normalizeDate(reservation.fechaSalida);
        if (!normalizedEntry || !normalizedExit) return false;
        return reservation.habitacion === roomName && normalizedCheckDate.getTime() >= normalizedEntry.getTime() && normalizedCheckDate.getTime() < normalizedExit.getTime();
      });
    }, [reservations, normalizeDate]);
    const isHoliday = useCallback((date) => {
      const normalizedCheckDate = normalizeDate(date);
      return holidays.some(h => normalizeDate(h.date)?.getTime() === normalizedCheckDate?.getTime());
    }, [holidays, normalizeDate]);
    const getMonthName = (date) => new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(date);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
    const dayNames = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    return (
      <div className="p-4 bg-white rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold text-gray-800">Disponibilidad</h2></div>
        <div className="flex justify-between items-center mb-4 p-2 bg-gray-100 rounded-lg">
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 rounded-full hover:bg-gray-200">‹</button>
            <h3 className="text-xl font-bold">{getMonthName(currentDate)} {year}</h3>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 rounded-full hover:bg-gray-200">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-600">{dayNames.map((day, index) => <div key={index}>{day}</div>)}</div>
        <div className="grid grid-cols-7 gap-1 mt-1">
            {Array.from({ length: firstDayIndex }).map((_, i) => <div key={`empty-${i}`} className="border rounded-md h-28"></div>)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1; const date = new Date(year, month, day);
                const isToday = normalizeDate(new Date())?.getTime() === normalizeDate(date)?.getTime();
                const holiday = isHoliday(date);
                return (
                    <div key={day} className={`border rounded-md h-28 p-1 ${holiday ? 'bg-yellow-100' : ''} ${isToday ? 'bg-blue-100' : ''}`}>
                        <div className={`text-sm font-bold ${isToday ? 'text-blue-600' : ''}`}>{day}</div>
                        <div className="text-xs mt-1 space-y-0.5">{rooms.map(room => { const reservation = getReservationForRoomAndDate(room.name, date); return (<div key={room.id} className={`p-0.5 rounded text-white text-[10px] ${reservation ? 'bg-red-500' : 'bg-green-500'}`}>{room.name.substring(0,4)}</div>); })}</div>
                    </div>
                );
            })}
        </div>
      </div>
    );
  };
  
  const ReservasTab = () => {
    const initialState = { fechaEntrada: '', fechaSalida: '', habitacion: '', nombreHuesped: '', telefonoEmail: '', numPersonas: 1, observaciones: '', pagoTotal: false, pagoParcial: false, valorPagado: 0, additionalGuests: [], selectedAddons: [], };
    const [formState, setFormState] = useState(initialState);
    const [editingReservationId, setEditingReservationId] = useState(null);

    useEffect(() => {
      if (editingReservationId) {
        const res = reservations.find(r => r.id === editingReservationId);
        if (res) { setFormState({ ...initialState, ...res, fechaEntrada: res.fechaEntrada?.toISOString().split('T')[0] || '', fechaSalida: res.fechaSalida?.toISOString().split('T')[0] || '', additionalGuests: res.additionalGuests || [], selectedAddons: res.selectedAddons || [] }); }
      } else { setFormState(initialState); }
    }, [editingReservationId, reservations]);

    const handleFormChange = (e) => {
      const { name, value, type, checked } = e.target;
      setFormState(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    
    const handleAdditionalGuestChange = (index, value) => { const newGuests = [...formState.additionalGuests]; newGuests[index] = value; setFormState(prev => ({...prev, additionalGuests: newGuests})); };
    const addAdditionalGuest = () => setFormState(prev => ({...prev, additionalGuests: [...prev.additionalGuests, '']}));
    const removeAdditionalGuest = (index) => setFormState(prev => ({...prev, additionalGuests: prev.additionalGuests.filter((_, i) => i !== index)}));

    const handleAddonChange = (addonName) => {
        setFormState(prev => {
            const currentAddons = prev.selectedAddons || [];
            return currentAddons.includes(addonName) ? {...prev, selectedAddons: currentAddons.filter(name => name !== addonName)} : {...prev, selectedAddons: [...currentAddons, addonName]};
        });
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!db) { showMessage('Error: Base de datos no disponible.'); return; }
      
      const { fechaEntrada, fechaSalida, habitacion, nombreHuesped, telefonoEmail } = formState;
      const entryDate = new Date(`${fechaEntrada}T00:00:00`); const exitDate = new Date(`${fechaSalida}T00:00:00`);

      if (exitDate <= entryDate) { showMessage('La fecha de salida debe ser posterior a la de entrada.'); return; }

      const isOverlapping = reservations.some(res => (editingReservationId !== res.id && res.habitacion === habitacion && normalizeDate(entryDate) < normalizeDate(res.fechaSalida) && normalizeDate(exitDate) > normalizeDate(res.fechaEntrada)));
      if (isOverlapping) { showMessage('¡Habitación ya reservada para esas fechas!'); return; }

      const pricePerNight = prices[habitacion] || 0;
      const totalNights = Math.ceil((exitDate - entryDate) / 86400000);
      const addonsTotal = (formState.selectedAddons || []).reduce((sum, name) => sum + (addons.find(a => a.name === name)?.price || 0), 0);
      const totalReservation = (pricePerNight * totalNights) + addonsTotal;
      let valorPagado = Number(formState.valorPagado);
      if (formState.pagoTotal) valorPagado = totalReservation;
      const valorPendiente = totalReservation - valorPagado;
      const reservationData = { ...formState, fechaEntrada: entryDate, fechaSalida: exitDate, numPersonas: Number(formState.numPersonas), precioNoche: pricePerNight, totalReserva: totalReservation, valorPagado, valorPendiente, updatedAt: new Date(), };
      delete reservationData.id;

      try {
        const reservationsRef = collection(db, `artifacts/${appId}/public/data/reservations`);
        let reservationId = editingReservationId;
        if (editingReservationId) {
          await updateDoc(doc(reservationsRef, editingReservationId), reservationData);
          showMessage('Reserva actualizada!');
        } else {
          const newReservation = await addDoc(reservationsRef, { ...reservationData, createdAt: new Date(), createdBy: userId });
          reservationId = newReservation.id;
          showMessage('Reserva creada!');
        }
        
        if (telefonoEmail) {
            const clientsRef = collection(db, `artifacts/${appId}/public/data/clients`);
            const q = query(clientsRef, where("telefonoEmail", "==", telefonoEmail));
            const clientSnapshot = await getDocs(q);
            if (clientSnapshot.empty) await addDoc(clientsRef, { nombreHuesped, telefonoEmail, reservationIds: [reservationId], createdAt: new Date() });
            else { await updateDoc(clientSnapshot.docs[0].ref, { reservationIds: [...(clientSnapshot.docs[0].data().reservationIds || []), reservationId] }); }
        }
        setEditingReservationId(null);
      } catch (error) { console.error("ERROR AL GUARDAR RESERVA:", error); showMessage(`Error al guardar: ${error.message}`); }
    };
    
    const handleDelete = (id, guestName) => requestConfirmation(() => deleteDoc(doc(db, `artifacts/${appId}/public/data/reservations`, id)).then(() => showMessage('Reserva eliminada.')).catch(err => showMessage(`Error al eliminar: ${err.message}`)), `¿Seguro que quieres eliminar la reserva de ${guestName}?`);
    
    const today = new Date().toISOString().split('T')[0];
    let minSalida = today;
    if (formState.fechaEntrada) { const nextDay = new Date(`${formState.fechaEntrada}T00:00:00`); nextDay.setDate(nextDay.getDate() + 1); minSalida = nextDay.toISOString().split('T')[0]; }

    return (
      <div className="p-4 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold mb-4">Gestión de Reservas</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mb-8 p-6 border rounded-xl bg-gray-50">
           <h3 className="col-span-full text-xl font-bold text-blue-700">{editingReservationId ? 'Editar Reserva' : 'Crear Nueva Reserva'}</h3>
            <div><label className="text-sm font-medium">Fecha de Entrada</label><input type="date" name="fechaEntrada" value={formState.fechaEntrada} onChange={handleFormChange} min={today} className="mt-1 block w-full p-2" required /></div>
            <div><label className="text-sm font-medium">Fecha de Salida</label><input type="date" name="fechaSalida" value={formState.fechaSalida} onChange={handleFormChange} min={minSalida} className="mt-1 block w-full p-2" required /></div>
            <div><label className="text-sm font-medium">Habitación</label><select name="habitacion" value={formState.habitacion} onChange={handleFormChange} className="mt-1 block w-full p-2" required><option value="">Selecciona</option>{rooms.map(room => <option key={room.id} value={room.name}>{room.name}</option>)}</select></div>
            <div><label className="text-sm font-medium"># Personas</label><input type="number" name="numPersonas" min="1" value={formState.numPersonas} onChange={handleFormChange} className="mt-1 block w-full p-2" required /></div>
            <div className="col-span-full border-t pt-4"><label className="text-sm font-medium">Huésped Principal</label><input type="text" name="nombreHuesped" value={formState.nombreHuesped} onChange={handleFormChange} className="mt-1 block w-full p-2" required /></div>
            <div className="col-span-full"><label className="text-sm font-medium">Teléfono / Email (Titular)</label><input type="text" name="telefonoEmail" value={formState.telefonoEmail} onChange={handleFormChange} className="mt-1 block w-full p-2" required /></div>
            <div className="col-span-full"><h4 className="text-sm font-medium mb-2">Huéspedes Adicionales</h4>{formState.additionalGuests.map((guest, index) => (<div key={index} className="flex items-center gap-2 mb-2"><input type="text" value={guest} onChange={(e) => handleAdditionalGuestChange(index, e.target.value)} className="flex-grow p-2" /><button type="button" onClick={() => removeAdditionalGuest(index)} className="p-2 bg-red-500 text-white rounded-md">-</button></div>))}<button type="button" onClick={addAdditionalGuest} className="mt-1 py-1 px-3 bg-blue-500 text-white rounded-md text-sm">+ Añadir</button></div>
            <div className="col-span-full border-t pt-4"><h4 className="text-sm font-medium mb-2">Servicios Adicionales</h4><div className="grid grid-cols-2 md:grid-cols-3 gap-2">{addons.map(addon => (<div key={addon.id} className="flex items-center"><input type="checkbox" id={`addon-${addon.id}`} checked={(formState.selectedAddons || []).includes(addon.name)} onChange={() => handleAddonChange(addon.name)} className="h-4 w-4 rounded"/><label htmlFor={`addon-${addon.id}`} className="ml-2 text-sm">{addon.name}</label></div>))}</div></div>
            <div className="col-span-full"><label className="text-sm font-medium">Observaciones</label><textarea name="observaciones" rows="3" value={formState.observaciones} onChange={handleFormChange} className="mt-1 block w-full p-2"></textarea></div>
            <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 border-t pt-4"><div className="flex items-center"><input type="checkbox" id="pagoTotal" name="pagoTotal" checked={formState.pagoTotal} onChange={handleFormChange} className="h-4 w-4 rounded"/><label htmlFor="pagoTotal" className="ml-2 block text-sm">Pago Total</label></div><div className="flex items-center"><input type="checkbox" id="pagoParcial" name="pagoParcial" checked={formState.pagoParcial} onChange={handleFormChange} className="h-4 w-4 rounded"/><label htmlFor="pagoParcial" className="ml-2 block text-sm">Abono Parcial</label></div></div>
            {formState.pagoParcial && !formState.pagoTotal && (<div className="col-span-full"><label htmlFor="valorPagado" className="block text-sm font-medium">Valor Abonado</label><input type="number" name="valorPagado" id="valorPagado" value={formState.valorPagado} onChange={handleFormChange} className="mt-1 block w-full p-2" /></div>)}
            <div className="col-span-full flex justify-end gap-x-4"><button type="button" onClick={()=>setEditingReservationId(null)} className="py-2 px-4 bg-gray-200 rounded-md">Cancelar</button><button type="submit" className="py-2 px-5 rounded-md text-white bg-blue-600">{editingReservationId ? 'Guardar' : 'Agregar'}</button></div>
        </form>
        <div className="mt-8 overflow-x-auto rounded-lg shadow-md"><table className="min-w-full bg-white"><thead className="bg-blue-100"><tr><th className="p-3 text-left text-xs uppercase">Huésped</th><th className="p-3 text-left text-xs uppercase">Habitación</th><th className="p-3 text-left text-xs uppercase">Fechas</th><th className="p-3 text-left text-xs uppercase">Acciones</th></tr></thead><tbody>{reservations.sort((a,b) => b.fechaEntrada - a.fechaEntrada).map(res => (<tr key={res.id} className="border-b hover:bg-gray-50"><td className="p-3">{res.nombreHuesped}</td><td className="p-3">{res.habitacion}</td><td className="p-3">{res.fechaEntrada?.toLocaleDateString('es-CO')} - {res.fechaSalida?.toLocaleDateString('es-CO')}</td><td className="p-3 flex space-x-2"><button onClick={() => setEditingReservationId(res.id)} className="py-1 px-3 bg-yellow-500 text-white rounded-md text-xs">Modificar</button><button onClick={() => handleDelete(res.id, res.nombreHuesped)} className="py-1 px-3 bg-red-500 text-white rounded-md text-xs">Eliminar</button></td></tr>))}</tbody></table></div>
      </div>
    );
  };
  
  const ResumenGeneralTab = () => {
    const totalReservas = reservations.length;
    const ingresosTotales = reservations.reduce((sum, res) => sum + (res.totalReserva || 0), 0);
    const totalPagado = reservations.reduce((sum, res) => sum + (res.valorPagado || 0), 0);
    const totalPendiente = ingresosTotales - totalPagado;
    const StatCard = ({ title, value, color }) => (<div className={`p-6 rounded-xl shadow-lg bg-gradient-to-br ${color}`}><h3 className="text-lg font-semibold text-white">{title}</h3><p className="text-4xl font-bold text-white mt-2">{value}</p></div>);
    return (<div className="p-4 bg-white rounded-lg shadow-lg"><h2 className="text-2xl font-bold mb-6">Resumen General del Negocio</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"><StatCard title="Total de Reservas" value={totalReservas} color="from-blue-500 to-blue-600" /><StatCard title="Ingresos Totales" value={`$${ingresosTotales.toLocaleString('es-CO')}`} color="from-green-500 to-green-600" /><StatCard title="Total Pagado" value={`$${totalPagado.toLocaleString('es-CO')}`} color="from-indigo-500 to-indigo-600" /><StatCard title="Valor Pendiente" value={`$${totalPendiente.toLocaleString('es-CO')}`} color="from-red-500 to-red-600" /></div></div>);
  };

  const ResumenCabañasTab = () => {
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const filteredReservations = reservations.filter(res => res.fechaEntrada?.toISOString().slice(0, 7) === selectedMonth);
    const cabinSummary = rooms.map(room => {
        const roomReservations = filteredReservations.filter(res => res.habitacion === room.name);
        return { name: room.name, reservationCount: roomReservations.length, totalIncome: roomReservations.reduce((sum, res) => sum + (res.totalReserva || 0), 0) };
    });
    const grandTotal = cabinSummary.reduce((sum, cabin) => sum + cabin.totalIncome, 0);
    const handleExport = () => {
        const date = new Date(`${selectedMonth}-02T12:00:00Z`);
        const monthName = date.toLocaleString('es-CO', { month: 'long', timeZone: 'UTC' });
        const year = date.getUTCFullYear();
        let htmlContent = `<html><head><title>Resumen de Ingresos - ${monthName} ${year}</title><style>body{font-family:sans-serif;padding:20px}h1{color:#0056b3}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #ddd;padding:12px;text-align:left}th{background-color:#f2f2f2;font-weight:700}.total-row{font-weight:700;background-color:#e9ecef}</style></head><body><h1>Resumen - ${monthName.charAt(0).toUpperCase()+monthName.slice(1)} ${year}</h1><p>Instrucciones: Copia y pega en Google Doc.</p><table><thead><tr><th>Cabaña</th><th># Reservas</th><th>Ingresos</th></tr></thead><tbody>${cabinSummary.map(c=>`<tr><td>${c.name}</td><td>${c.reservationCount}</td><td>$${c.totalIncome.toLocaleString('es-CO')}</td></tr>`).join('')}<tr class="total-row"><td colspan="2">Total General</td><td>$${grandTotal.toLocaleString('es-CO')}</td></tr></tbody></table></body></html>`;
        const newWindow = window.open(); newWindow.document.write(htmlContent); newWindow.document.close();
    };
    return (<div className="p-4 bg-white rounded-lg shadow-lg"><h2 className="text-2xl font-bold mb-4">Resumen por Cabaña</h2><div className="flex justify-between items-center mb-6 p-4 bg-gray-50 rounded-lg"><div><label htmlFor="month-selector" className="block text-sm font-medium">Mes:</label><input type="month" id="month-selector" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="mt-1 p-2 border rounded-md"/></div><button onClick={handleExport} className="py-2 px-4 bg-green-600 text-white rounded-lg">Exportar</button></div><div className="overflow-x-auto rounded-lg shadow-md"><table className="min-w-full bg-white"><thead className="bg-blue-100"><tr><th className="p-3 text-left text-xs uppercase">Cabaña</th><th className="p-3 text-left text-xs uppercase"># Reservas</th><th className="p-3 text-left text-xs uppercase">Ingresos</th></tr></thead><tbody>{cabinSummary.map(c=>(<tr key={c.name} className="border-b"><td className="p-3 font-medium">{c.name}</td><td className="p-3">{c.reservationCount}</td><td className="p-3">$ {c.totalIncome.toLocaleString('es-CO')}</td></tr>))}<tr className="border-t-2 font-bold bg-gray-100"><td className="p-3" colSpan="2">Total Mes</td><td className="p-3">$ {grandTotal.toLocaleString('es-CO')}</td></tr></tbody></table></div></div>);
  };

  const ClientesTab = () => {
    const handleExport = () => {
        let htmlContent = `<html><head><title>Base de Datos de Clientes</title><style>body{font-family:sans-serif;padding:20px}h1{color:#0056b3}table{border-collapse:collapse;width:100%;margin-top:20px;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f2f2f2;font-weight:700}</style></head><body><h1>Base de Datos de Clientes</h1><p>Instrucciones: Copia y pega en Google Doc.</p><table><thead><tr><th>Nombre</th><th>Contacto</th><th># Reservas</th><th>Historial</th></tr></thead><tbody>${clients.map(c=>{const clientReservations=reservations.filter(r=>r.telefonoEmail===c.telefonoEmail).sort((a,b)=>b.fechaEntrada-a.fechaEntrada);const history=clientReservations.map(r=>r.fechaEntrada.toLocaleDateString('es-CO')).join(', ');return`<tr><td>${c.nombreHuesped}</td><td>${c.telefonoEmail}</td><td>${clientReservations.length}</td><td>${history}</td></tr>`}).join('')}</tbody></table></body></html>`;
        const newWindow = window.open(); newWindow.document.write(htmlContent); newWindow.document.close();
    };
    return (<div className="p-4 bg-white rounded-lg shadow-lg"><div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold">Base de Datos de Clientes</h2><button onClick={handleExport} className="py-2 px-4 bg-green-600 text-white rounded-lg">Exportar</button></div><div className="overflow-x-auto rounded-lg shadow-md"><table className="min-w-full bg-white"><thead className="bg-blue-100"><tr><th className="p-3 text-left text-xs uppercase">Nombre</th><th className="p-3 text-left text-xs uppercase">Contacto</th><th className="p-3 text-center text-xs uppercase"># Reservas</th><th className="p-3 text-left text-xs uppercase">Última Estancia</th></tr></thead><tbody>{clients.map(c=>{const clientReservations=reservations.filter(r=>r.telefonoEmail===c.telefonoEmail).sort((a,b)=>b.fechaEntrada-a.fechaEntrada);const lastStay=clientReservations.length>0?clientReservations[0].fechaEntrada.toLocaleDateString('es-CO'):'N/A';return(<tr key={c.id} className="border-b"><td className="p-3">{c.nombreHuesped}</td><td className="p-3">{c.telefonoEmail}</td><td className="p-3 text-center">{clientReservations.length}</td><td className="p-3">{lastStay}</td></tr>)})}</tbody></table></div></div>);
  };
  
  const ChecklistTab = () => {
    const generateChecklist = (res) => {
        const allGuests = [res.nombreHuesped, ...(res.additionalGuests || [])].filter(Boolean);
        const guestListHtml = allGuests.map(guest => `<li>${guest}</li>`).join('');
        const checklistHtml = `<html><head><title>Checklist Reserva - ${res.nombreHuesped}</title><style>body{font-family:'Segoe UI',sans-serif;margin:20px;background-color:#f4f4f9;color:#333}.container{max-width:800px;margin:auto;background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1)}.header{text-align:center;border-bottom:2px solid #e0e0e0;padding-bottom:20px;margin-bottom:30px}.section{margin-bottom:25px}.section h2{color:#0056b3;border-bottom:1px solid #0056b3;padding-bottom:8px;margin-bottom:15px}.details-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:15px}.detail-item{padding:15px;border-radius:8px;background:#f9f9f9;border-left:4px solid #0056b3}.detail-item strong{display:block;margin-bottom:5px}.guest-list{list-style-type:none;padding-left:0}.policy-item{background-color:#eef7ff;border-left-color:#17a2b8}.policy-item.warning{background-color:#fff3cd;border-left-color:#ffc107}.footer{text-align:center;margin-top:40px}@media print{.no-print{display:none}}</style></head><body><div class="container"><div class="header"><h1>Detalles de la Reserva</h1></div><div class="section"><h2>Información General</h2><div class="details-grid"><div class="detail-item"><strong>Huéspedes (${allGuests.length}):</strong><ul class="guest-list">${guestListHtml}</ul></div><div class="detail-item"><strong>Contacto:</strong> ${res.telefonoEmail}</div><div class="detail-item"><strong>Cabaña:</strong> ${res.habitacion}</div><div class="detail-item"><strong>Check-in:</strong> ${res.fechaEntrada?.toLocaleDateString('es-CO')} (3:00 PM)</div><div class="detail-item"><strong>Check-out:</strong> ${res.fechaSalida?.toLocaleDateString('es-CO')} (5:00 PM)</div></div></div>${(res.selectedAddons||[]).length>0?`<div class="section"><h2>Servicios Adicionales</h2><div class="details-grid"><div class="detail-item">${res.selectedAddons.join(', ')}</div></div></div>`:''} <div class="section"><h2>Resumen Financiero</h2><div class="details-grid"><div class="detail-item"><strong>Total:</strong> $${(res.totalReserva||0).toLocaleString('es-CO')}</div><div class="detail-item"><strong>Pagado:</strong> $${(res.valorPagado||0).toLocaleString('es-CO')}</div><div class="detail-item"><strong>Pendiente:</strong> $${(res.valorPendiente||0).toLocaleString('es-CO')}</div></div></div><div class="section"><h2>Políticas</h2><div class="details-grid"><div class="detail-item policy-item"><strong>Ambiental:</strong> Te invitamos a reciclar y usar el agua conscientemente.</div><div class="detail-item policy-item warning"><strong>No Fumar:</strong> Prohibido fumar en habitaciones.</div></div></div><div class="footer"><button class="no-print" onclick="window.print()">Imprimir</button></div></div></body></html>`;
        const newWindow = window.open(); newWindow.document.write(checklistHtml); newWindow.document.close();
    };
    const generateGoogleCalendarLink = (res) => {
        const formatForGoogle = (date) => date.toISOString().replace(/-|:|\.\d\d\d/g, '');
        const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Reserva: ${res.nombreHuesped} - ${res.habitacion}`)}&dates=${formatForGoogle(res.fechaEntrada)}/${formatForGoogle(res.fechaSalida)}&details=${encodeURIComponent(`Huésped: ${res.nombreHuesped}`)}`;
        window.open(url, '_blank');
    };
    return (<div className="p-4 bg-white rounded-lg shadow-lg"><h2 className="text-2xl font-bold mb-4">Checklist para Clientes</h2><div className="overflow-x-auto rounded-lg shadow-md"><table className="min-w-full bg-white"><thead className="bg-blue-100"><tr><th className="p-3 text-left text-xs uppercase">Huésped</th><th className="p-3 text-left text-xs uppercase">Habitación</th><th className="p-3 text-left text-xs uppercase">Fechas</th><th className="p-3 text-left text-xs uppercase">Acciones</th></tr></thead><tbody>{reservations.sort((a,b) => b.fechaEntrada - a.fechaEntrada).map(res => (<tr key={res.id} className="border-b hover:bg-gray-50"><td className="p-3">{res.nombreHuesped}</td><td className="p-3">{res.habitacion}</td><td className="p-3">{res.fechaEntrada?.toLocaleDateString('es-CO')}</td><td className="p-3 flex space-x-2"><button onClick={() => generateChecklist(res)} className="py-1 px-3 bg-teal-500 text-white rounded-md text-xs">Checklist</button><button onClick={() => generateGoogleCalendarLink(res)} className="py-1 px-3 bg-blue-500 text-white rounded-md text-xs">Calendar</button></td></tr>))}</tbody></table></div></div>);
  };
  
  const PreciosTab = () => {
    const [currentPrices, setCurrentPrices] = useState(prices);
    useEffect(() => { setCurrentPrices(prices); }, [prices]);
    const handlePriceChange = (roomName, value) => setCurrentPrices(prev => ({...prev, [roomName]: Number(value) }));
    const handleSavePrices = async () => {
        if(!db) { showMessage("Base de datos no conectada"); return; }
        const pricesRef = collection(db, `artifacts/${appId}/public/data/prices`);
        const savePromises = Object.entries(currentPrices).map(([roomName, price]) => (typeof price === 'number' && !isNaN(price)) ? setDoc(doc(pricesRef, roomName), { price }) : Promise.resolve());
        try { await Promise.all(savePromises); showMessage("Precios actualizados!"); } 
        catch (error) { showMessage(`Error al guardar precios.`); }
    };
    return (<div className="p-4 bg-white rounded-lg shadow-lg"><h2 className="text-2xl font-bold mb-6">Precios por Habitación</h2><div className="space-y-4 max-w-md">{rooms.map(room => (<div key={room.id} className="grid grid-cols-3 items-center gap-4"><label htmlFor={`price-${room.id}`} className="font-medium col-span-1">{room.name}</label><input type="number" id={`price-${room.id}`} value={currentPrices[room.name] || ''} onChange={(e) => handlePriceChange(room.name, e.target.value)} className="col-span-2 p-2 border rounded-md"/></div>))}</div><button onClick={handleSavePrices} className="mt-6 py-2 px-6 bg-blue-600 text-white rounded-lg">Guardar Precios</button></div>);
  };
  
  const AdicionalesTab = () => {
    const [newAddon, setNewAddon] = useState({ name: '', price: 0 });
    const handleAddonChange = (e) => setNewAddon({...newAddon, [e.target.name]: e.target.name === 'price' ? Number(e.target.value) : e.target.value});
    const handleAddAddon = async (e) => {
        e.preventDefault();
        if(!db || !newAddon.name || newAddon.price <= 0) { showMessage("Nombre y precio válido son requeridos."); return; }
        try { await addDoc(collection(db, `artifacts/${appId}/public/data/adicionales`), newAddon); setNewAddon({ name: '', price: 0 }); showMessage("Adicional agregado!"); } 
        catch (error) { showMessage("Error al agregar."); }
    };
    const handleDeleteAddon = (id) => requestConfirmation(async () => { await deleteDoc(doc(db, `artifacts/${appId}/public/data/adicionales`, id)); showMessage("Adicional eliminado."); }, `¿Seguro que quieres eliminar?`);
    return (<div className="p-4 bg-white rounded-lg shadow-lg"><h2 className="text-2xl font-bold mb-6">Gestionar Servicios Adicionales</h2><form onSubmit={handleAddAddon} className="flex flex-col md:flex-row gap-4 mb-6 p-4 border rounded-lg bg-gray-50"><input type="text" name="name" placeholder="Nombre del servicio" value={newAddon.name} onChange={handleAddonChange} className="p-2 border rounded-md flex-grow" required/><input type="number" name="price" placeholder="Precio" value={newAddon.price} onChange={handleAddonChange} className="p-2 border rounded-md" required/><button type="submit" className="py-2 px-4 bg-blue-600 text-white rounded-lg">Agregar</button></form><ul className="space-y-2">{addons.map(a => (<li key={a.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md"><span>{a.name} - ${a.price.toLocaleString('es-CO')}</span><button onClick={() => handleDeleteAddon(a.id)} className="text-red-500 font-semibold">Eliminar</button></li>))}</ul></div>);
  };
  
  const ConfiguracionTab = () => {
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
    const handleAddHoliday = async (e) => {
        e.preventDefault();
        if(!db || !newHoliday.date || !newHoliday.name) return;
        try { await addDoc(collection(db, `artifacts/${appId}/public/data/holidays`), { date: new Date(`${newHoliday.date}T00:00:00`), name: newHoliday.name }); setNewHoliday({ date: '', name: '' }); showMessage("Festivo agregado!"); }
        catch (error) { console.error("Error agregando festivo:", error); }
    };
    const handleDeleteHoliday = (id) => requestConfirmation(async () => { await deleteDoc(doc(db, `artifacts/${appId}/public/data/holidays`, id)); showMessage("Festivo eliminado."); }, `¿Seguro que quieres eliminar?`);
    return (<div className="p-4 bg-white rounded-lg shadow-lg"><h2 className="text-2xl font-bold mb-6">Días Festivos</h2><form onSubmit={handleAddHoliday} className="flex flex-col md:flex-row gap-4 mb-6 p-4 border rounded-lg bg-gray-50"><input type="date" value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} className="p-2 border rounded-md flex-grow" required/><input type="text" placeholder="Nombre del festivo" value={newHoliday.name} onChange={e => setNewHoliday({...newHoliday, name: e.target.value})} className="p-2 border rounded-md flex-grow" required/><button type="submit" className="py-2 px-4 bg-blue-600 text-white rounded-lg">Agregar</button></form><ul className="space-y-2">{holidays.sort((a,b) => a.date - b.date).map(h => (<li key={h.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md"><span>{h.date.toLocaleDateString('es-CO',{timeZone:'UTC'})} - {h.name}</span><button onClick={() => handleDeleteHoliday(h.id)} className="text-red-500 font-semibold">Eliminar</button></li>))}</ul></div>);
  };
  
  const ConfirmModal = ({ show, onConfirm, onCancel, message }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-8 shadow-2xl max-w-sm w-full">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Confirmar Acción</h3>
                <p className="mb-6 text-gray-600">{message || '¿Estás seguro?'}</p>
                <div className="flex justify-end space-x-4"><button onClick={onCancel} className="px-4 py-2 rounded-md bg-gray-200 font-semibold">Cancelar</button><button onClick={onConfirm} className="px-4 py-2 rounded-md bg-red-600 text-white font-semibold">Confirmar</button></div>
            </div>
        </div>
    );
  };

  const tabs = {
      disponibilidad: <DisponibilidadTab />,
      reservas: <ReservasTab />,
      checklist: <ChecklistTab />,
      clientes: <ClientesTab />,
      adicionales: <AdicionalesTab />,
      precios: <PreciosTab />,
      configuracion: <ConfiguracionTab />,
      "resumen por cabaña": <ResumenCabañasTab />,
      "resumen general": <ResumenGeneralTab />,
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans">
      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden">
        <header className="bg-blue-700 text-white p-6">
          <h1 className="text-3xl font-extrabold">KAWSAY BOOKING APP</h1>
          <nav className="flex flex-wrap space-x-1 mt-4">
            {Object.keys(tabs).map(tabName => (
              <button key={tabName} onClick={() => setActiveTab(tabName)}
                className={`py-2 px-4 rounded-full text-sm font-medium transition-colors duration-200 ${activeTab === tabName ? 'bg-white text-blue-700 shadow-md' : 'hover:bg-blue-600'}`}
              >
                {tabName.charAt(0).toUpperCase() + tabName.slice(1)}
              </button>
            ))}
          </nav>
        </header>

        {message && <div className="p-3 bg-blue-100 text-blue-800 text-center">{message}</div>}

        <main className="p-6">
          {!isAuthReady ? <div className="text-center py-10"><p>Cargando datos...</p></div> : tabs[activeTab]}
        </main>
      </div>
      
      <ConfirmModal show={showConfirmModal} onConfirm={handleConfirm} onCancel={handleCancel} message={confirmMessage}/>
    </div>
  );
}

export default App;
