
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      navigate("/");
    } catch (error: any) {
      toast({
        title: "Error de inicio de sesión",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: email.split("@")[0],
          },
        },
      });

      if (error) throw error;

      toast({
        title: "Registro exitoso",
        description: "Por favor, inicia sesión para continuar.",
      });
    } catch (error: any) {
      toast({
        title: "Error de registro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 bg-gray-800 p-6 rounded-lg shadow-xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">PPG Monitor</h2>
          <p className="mt-2 text-sm text-gray-400">
            Inicia sesión o regístrate para continuar
          </p>
        </div>

        <form className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-gray-700 text-white border-gray-600"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-700 text-white border-gray-600"
              />
            </div>
          </div>

          <div className="space-y-4">
            <Button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-medical-blue hover:bg-medical-blue/90"
            >
              {loading ? "Cargando..." : "Iniciar Sesión"}
            </Button>
            <Button
              type="button"
              onClick={handleSignUp}
              disabled={loading}
              variant="outline"
              className="w-full border-medical-blue text-medical-blue hover:bg-medical-blue/10"
            >
              Registrarse
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
