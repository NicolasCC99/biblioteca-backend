const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({
  origin: [
    'https://biblioteca-frontend-bcyo.vercel.app',
    'http://localhost:4200',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Conexión a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Modelo de Usuario
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String,
  name: String,
  email: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Modelo de Libro
const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  isbn: { type: String, unique: true, required: true },
  category: String,
  publishYear: Number,
  totalCopies: { type: Number, default: 1 },
  availableCopies: { type: Number, default: 1 },
  description: String,
  coverImage: String,
  createdAt: { type: Date, default: Date.now }
});

const Book = mongoose.model('Book', bookSchema);

// Modelo de Préstamo
const loanSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  loanDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  returnDate: { type: Date, default: null },
  status: { type: String, enum: ['active', 'returned', 'overdue'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

const Loan = mongoose.model('Loan', loanSchema);
// Ruta de Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username, password });
    
    if (user) {
      res.json({
        success: true,
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
          name: user.name
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error del servidor'
    });
  }
});
app.get('/api/books', async (req, res) => {
  try {
    const books = await Book.find();
    res.json({ success: true, books });
  } catch (error) {
    console.error('Error al obtener libros:', error);
    res.status(500).json({ success: false, message: 'Error al obtener libros' });
  }
});

// Obtener un libro por ID
app.get('/api/books/:id', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ success: false, message: 'Libro no encontrado' });
    }
    res.json({ success: true, book });
  } catch (error) {
    console.error('Error al obtener libro:', error);
    res.status(500).json({ success: false, message: 'Error al obtener libro' });
  }
});

// Crear un libro (solo admin)
app.post('/api/books', async (req, res) => {
  try {
    const newBook = new Book(req.body);
    await newBook.save();
    res.json({ success: true, book: newBook });
  } catch (error) {
    console.error('Error al crear libro:', error);
    res.status(500).json({ success: false, message: 'Error al crear libro' });
  }
});

// Actualizar un libro (solo admin)
app.put('/api/books/:id', async (req, res) => {
  try {
    const updatedBook = await Book.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    );
    if (!updatedBook) {
      return res.status(404).json({ success: false, message: 'Libro no encontrado' });
    }
    res.json({ success: true, book: updatedBook });
  } catch (error) {
    console.error('Error al actualizar libro:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar libro' });
  }
});

// Eliminar un libro (solo admin)
app.delete('/api/books/:id', async (req, res) => {
  try {
    const deletedBook = await Book.findByIdAndDelete(req.params.id);
    if (!deletedBook) {
      return res.status(404).json({ success: false, message: 'Libro no encontrado' });
    }
    res.json({ success: true, message: 'Libro eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar libro:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar libro' });
  }
});
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
// ========== RUTAS DE PRÉSTAMOS ==========

// Obtener todos los préstamos (admin ve todos, estudiante ve solo los suyos)
app.get('/api/loans', async (req, res) => {
  try {
    const { userId, role } = req.query;
    const query = role === 'student' ? { userId } : {};
    
    // Usar populate para obtener detalles de libros y usuarios
    const loans = await Loan.find(query)
      .populate('bookId')
      .populate('userId', 'name username email');
    
    res.json({ success: true, loans });
  } catch (error) {
    console.error('Error al obtener préstamos:', error);
    res.status(500).json({ success: false, message: 'Error al obtener préstamos' });
  }
});

// Crear un préstamo (solo admin)
app.post('/api/loans', async (req, res) => {
  try {
    const { bookId, userId, dueDate } = req.body;
    
    // Verificar que existan libro y usuario
    const book = await Book.findById(bookId);
    const user = await User.findById(userId);
    
    if (!book) {
      return res.status(400).json({ success: false, message: 'Libro no encontrado' });
    }
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    // Verificar disponibilidad del libro
    if (book.availableCopies <= 0) {
      return res.status(400).json({ success: false, message: 'Libro no disponible' });
    }
    
    // Crear préstamo
    const newLoan = new Loan({
      bookId,
      userId,
      dueDate: new Date(dueDate)
    });
    await newLoan.save();
    
    // Actualizar copias disponibles
    book.availableCopies -= 1;
    await book.save();
    
    // Obtener el préstamo con datos poblados
    await newLoan.populate('bookId');
    await newLoan.populate('userId', 'name username email');
    
    res.json({ success: true, loan: newLoan });
  } catch (error) {
    console.error('Error al crear préstamo:', error);
    res.status(500).json({ success: false, message: 'Error al crear préstamo' });
  }
});

// Devolver un libro (solo admin)
app.put('/api/loans/:id/return', async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Préstamo no encontrado' });
    }
    
    // Marcar como devuelto
    loan.returnDate = new Date();
    loan.status = 'returned';
    await loan.save();
    
    // Aumentar copias disponibles
    const book = await Book.findById(loan.bookId);
    if (book) {
      book.availableCopies += 1;
      await book.save();
    }
    
    // Obtener el préstamo actualizado con datos poblados
    await loan.populate('bookId');
    await loan.populate('userId', 'name username email');
    
    res.json({ success: true, loan });
  } catch (error) {
    console.error('Error al devolver libro:', error);
    res.status(500).json({ success: false, message: 'Error al devolver libro' });
  }
});

// Obtener lista de usuarios 
app.get('/api/users/list', async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('_id name username email');
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ success: false, message: 'Error al obtener usuarios' });
  }
});