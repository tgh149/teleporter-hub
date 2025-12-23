-- Create increment_conversions function
CREATE OR REPLACE FUNCTION public.increment_conversions(uid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles 
  SET total_conversions = total_conversions + 1
  WHERE user_id = uid;
END;
$$;